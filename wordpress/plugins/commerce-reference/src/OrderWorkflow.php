<?php

declare(strict_types=1);

namespace CommerceReference;

use WC_Order;
use WC_Order_Item_Product;
use WC_Product;

final class OrderWorkflow
{
    private const TIMELINE_META = '_commerce_timeline';

    public static function createCheckout(array $payload): array
    {
        $input = self::validateCheckout($payload);
        $requestHash = hash('sha256', wp_json_encode($input));
        $claimed = Database::claimCheckout($input['idempotencyKey'], $requestHash);

        if (!$claimed) {
            return self::replayCheckout($input['idempotencyKey'], $requestHash);
        }

        $order = null;

        try {
            $order = wc_create_order([
                'status' => 'pending',
                'created_via' => 'headless-storefront',
            ]);

            if (is_wp_error($order)) {
                throw new WorkflowError('The pending order could not be created.', 503);
            }

            $reference = 'ord_' . str_replace('-', '', wp_generate_uuid4());
            $holdMinutes = max(
                1,
                (int) get_option('woocommerce_hold_stock_minutes', '15')
            );
            $holdExpiresAt = gmdate(DATE_ATOM, time() + ($holdMinutes * MINUTE_IN_SECONDS));

            $order->set_billing_email($input['email']);
            $order->set_payment_method('stripe-test');
            $order->set_payment_method_title('Stripe test mode');
            $order->update_meta_data('_commerce_reference', $reference);
            $order->update_meta_data('_commerce_cart_id', $input['cartId']);
            $order->update_meta_data('_commerce_hold_expires_at', $holdExpiresAt);
            $order->update_meta_data('_commerce_idempotency_key', $input['idempotencyKey']);

            foreach ($input['lines'] as $line) {
                $productId = wc_get_product_id_by_sku($line['sku']);
                $product = $productId > 0 ? wc_get_product($productId) : null;

                if (!$product instanceof WC_Product || !$product->is_purchasable()) {
                    throw new WorkflowError('A requested product is unavailable.', 409);
                }

                if (!$product->is_in_stock()) {
                    throw new WorkflowError('A requested product is out of stock.', 409);
                }

                $order->add_product($product, $line['quantity']);
            }

            self::appendTimeline(
                $order,
                'checkout.received',
                'Checkout command accepted and repriced by WooCommerce.'
            );
            $order->calculate_totals(false);
            $order->save();

            try {
                wc_reserve_stock_for_order($order);
            } catch (\Throwable $error) {
                $order->update_status(
                    'failed',
                    'The authoritative stock reservation could not be acquired.'
                );
                throw new WorkflowError(
                    'A requested quantity is no longer available.',
                    409
                );
            }

            self::appendTimeline(
                $order,
                'stock.reserved',
                sprintf('WooCommerce reserved stock for %d minutes.', $holdMinutes)
            );
            $order->save();

            $body = self::orderView($order);
            Database::completeCheckout(
                $input['idempotencyKey'],
                $order->get_id(),
                'payment_pending',
                201,
                $body
            );

            return ['status' => 201, 'body' => $body];
        } catch (WorkflowError $error) {
            if ($order instanceof WC_Order && $order->get_id() > 0) {
                wc_release_stock_for_order($order);
            }

            $body = ['error' => $error->getMessage()];
            Database::completeCheckout(
                $input['idempotencyKey'],
                $order instanceof WC_Order ? $order->get_id() : null,
                'failed',
                $error->status,
                $body
            );

            return ['status' => $error->status, 'body' => $body];
        } catch (\Throwable $error) {
            if ($order instanceof WC_Order && $order->get_id() > 0) {
                wc_release_stock_for_order($order);
                $order->update_status(
                    'failed',
                    'The checkout workflow stopped before payment.'
                );
            }

            $body = ['error' => 'The checkout workflow is temporarily unavailable.'];
            Database::completeCheckout(
                $input['idempotencyKey'],
                $order instanceof WC_Order ? $order->get_id() : null,
                'failed',
                503,
                $body
            );

            return ['status' => 503, 'body' => $body];
        }
    }

    public static function attachPayment(
        string $reference,
        array $payload
    ): array {
        $cartId = self::requiredUuid($payload['cartId'] ?? null, 'cart identifier');
        $paymentIntentId = self::requiredIdentifier(
            $payload['paymentIntentId'] ?? null,
            'payment intent identifier'
        );
        $order = self::findOrder($reference, $cartId);
        $existing = (string) $order->get_meta('_commerce_payment_intent_id', true);

        if ($existing !== '' && $existing !== $paymentIntentId) {
            throw new WorkflowError(
                'The order is already attached to a different payment intent.',
                409
            );
        }

        if ($existing === '') {
            $order->update_meta_data('_commerce_payment_intent_id', $paymentIntentId);
            self::appendTimeline(
                $order,
                'payment.intent.created',
                'A test-mode payment intent was attached to the pending order.'
            );
            $order->save();
        }

        return self::orderView($order);
    }

    public static function processPaymentEvent(array $payload): array
    {
        $providerEventId = self::requiredIdentifier(
            $payload['providerEventId'] ?? null,
            'provider event identifier'
        );
        $paymentIntentId = self::requiredIdentifier(
            $payload['paymentIntentId'] ?? null,
            'payment intent identifier'
        );
        $eventType = self::requiredEventType($payload['type'] ?? null);
        $amount = self::requiredAmount($payload['amount'] ?? null);
        $currency = self::requiredCurrency($payload['currency'] ?? null);
        $eventKey = hash('sha256', $paymentIntentId . '|' . $eventType);
        $payloadHash = hash(
            'sha256',
            wp_json_encode([
                'paymentIntentId' => $paymentIntentId,
                'type' => $eventType,
                'amount' => $amount,
                'currency' => $currency,
            ])
        );
        $claimed = Database::claimEvent(
            $eventKey,
            $providerEventId,
            $paymentIntentId,
            $eventType,
            $payloadHash
        );

        if (!$claimed) {
            $event = Database::getEvent($eventKey);
            if (!$event || !hash_equals((string) $event['payload_hash'], $payloadHash)) {
                throw new WorkflowError(
                    'The payment event conflicts with an earlier delivery.',
                    409
                );
            }
            if ($event['state'] === 'completed' && (int) $event['order_id'] > 0) {
                $order = wc_get_order((int) $event['order_id']);
                if ($order instanceof WC_Order) {
                    return [
                        'duplicate' => true,
                        'order' => self::orderView($order),
                    ];
                }
            }
            throw new WorkflowError('The payment event is already being processed.', 409);
        }

        $order = self::findOrderByPaymentIntent($paymentIntentId);

        try {
            self::assertPaymentMatchesOrder($order, $amount, $currency);

            if ($eventType === 'payment_intent.succeeded') {
                if (!$order->is_paid()) {
                    $order->payment_complete($paymentIntentId);
                    $order = wc_get_order($order->get_id());
                    if (!$order instanceof WC_Order) {
                        throw new \RuntimeException('The paid order could not be reloaded.');
                    }
                    self::appendTimeline(
                        $order,
                        'payment.succeeded',
                        'The signed payment result completed the WooCommerce order.'
                    );
                    $order->save();
                }
            } elseif (!$order->is_paid()) {
                $status = $eventType === 'payment_intent.canceled'
                    ? 'cancelled'
                    : 'failed';
                $order->update_status(
                    $status,
                    'The test payment did not complete.'
                );
                wc_release_stock_for_order($order);
                self::appendTimeline(
                    $order,
                    'payment.failed',
                    'The payment failed and the stock reservation was released.'
                );
                $order->save();
            }

            Database::completeEvent(
                $eventKey,
                $order->get_id(),
                'completed'
            );

            return [
                'duplicate' => false,
                'order' => self::orderView($order),
            ];
        } catch (\Throwable $error) {
            Database::completeEvent(
                $eventKey,
                $order->get_id(),
                'failed',
                'Payment event processing failed.'
            );
            throw $error;
        }
    }

    public static function getOrder(
        string $reference,
        string $cartId
    ): array {
        return self::orderView(self::findOrder($reference, $cartId));
    }

    public static function cancelOrder(
        string $reference,
        string $cartId
    ): array {
        $order = self::findOrder($reference, $cartId);
        if (!$order->is_paid() && !in_array($order->get_status(), ['cancelled', 'failed'], true)) {
            $order->update_status(
                'cancelled',
                'The headless checkout was cancelled before payment.'
            );
            wc_release_stock_for_order($order);
            self::appendTimeline(
                $order,
                'checkout.cancelled',
                'The pending checkout was cancelled and its stock hold was released.'
            );
            $order->save();
        }

        return self::orderView($order);
    }

    private static function replayCheckout(
        string $idempotencyKey,
        string $requestHash
    ): array {
        $record = Database::getCheckout($idempotencyKey);

        if (!$record || !hash_equals((string) $record['request_hash'], $requestHash)) {
            return [
                'status' => 409,
                'body' => [
                    'error' => 'The idempotency key was already used for another checkout.',
                ],
            ];
        }

        if (!is_string($record['response']) || $record['response'] === '') {
            return [
                'status' => 409,
                'body' => ['error' => 'The checkout command is still being processed.'],
            ];
        }

        $body = json_decode($record['response'], true);
        if (!is_array($body)) {
            return [
                'status' => 503,
                'body' => ['error' => 'The stored checkout result could not be read.'],
            ];
        }

        $body['replayed'] = true;

        return [
            'status' => (int) $record['http_status'],
            'body' => $body,
        ];
    }

    private static function validateCheckout(array $payload): array
    {
        $idempotencyKey = self::requiredUuid(
            $payload['idempotencyKey'] ?? null,
            'idempotency key'
        );
        $cartId = self::requiredUuid($payload['cartId'] ?? null, 'cart identifier');
        $email = sanitize_email((string) ($payload['email'] ?? ''));

        if (!is_email($email) || !str_ends_with(strtolower($email), '.test')) {
            throw new WorkflowError(
                'Checkout accepts synthetic .test email addresses only.',
                400
            );
        }

        $rawLines = $payload['lines'] ?? null;
        if (!is_array($rawLines) || $rawLines === [] || count($rawLines) > 20) {
            throw new WorkflowError('Checkout requires between 1 and 20 cart lines.', 400);
        }

        $lines = [];
        foreach ($rawLines as $rawLine) {
            if (!is_array($rawLine)) {
                throw new WorkflowError('A checkout line is invalid.', 400);
            }
            $sku = strtoupper(trim((string) ($rawLine['sku'] ?? '')));
            $quantity = $rawLine['quantity'] ?? null;
            if (
                !preg_match('/^[A-Z0-9-]{3,40}$/', $sku) ||
                !is_int($quantity) ||
                $quantity < 1 ||
                $quantity > 20
            ) {
                throw new WorkflowError('A checkout line is invalid.', 400);
            }
            $lines[] = ['sku' => $sku, 'quantity' => $quantity];
        }

        usort(
            $lines,
            static fn (array $left, array $right): int =>
                strcmp($left['sku'], $right['sku'])
        );

        return [
            'idempotencyKey' => $idempotencyKey,
            'cartId' => $cartId,
            'email' => strtolower($email),
            'lines' => $lines,
        ];
    }

    private static function findOrder(
        string $reference,
        string $cartId
    ): WC_Order {
        if (!preg_match('/^ord_[a-f0-9]{32}$/', $reference)) {
            throw new WorkflowError('The order reference is invalid.', 400);
        }
        self::requiredUuid($cartId, 'cart identifier');

        $orders = wc_get_orders([
            'limit' => 1,
            'meta_key' => '_commerce_reference',
            'meta_value' => $reference,
        ]);
        $order = $orders[0] ?? null;

        if (
            !$order instanceof WC_Order ||
            !hash_equals(
                (string) $order->get_meta('_commerce_cart_id', true),
                $cartId
            )
        ) {
            throw new WorkflowError('The order was not found.', 404);
        }

        return $order;
    }

    private static function findOrderByPaymentIntent(
        string $paymentIntentId
    ): WC_Order {
        $orders = wc_get_orders([
            'limit' => 1,
            'meta_key' => '_commerce_payment_intent_id',
            'meta_value' => $paymentIntentId,
        ]);
        $order = $orders[0] ?? null;

        if (!$order instanceof WC_Order) {
            throw new WorkflowError('The payment order was not found.', 404);
        }

        return $order;
    }

    private static function assertPaymentMatchesOrder(
        WC_Order $order,
        int $amount,
        string $currency
    ): void {
        $expectedAmount = (int) round((float) $order->get_total() * 100);
        if (
            $amount !== $expectedAmount ||
            strtoupper($currency) !== strtoupper($order->get_currency())
        ) {
            throw new WorkflowError(
                'The payment amount does not match the authoritative order.',
                409
            );
        }
    }

    private static function orderView(WC_Order $order): array
    {
        $items = [];
        foreach ($order->get_items() as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }
            $product = $item->get_product();
            $items[] = [
                'sku' => $product instanceof WC_Product ? $product->get_sku() : '',
                'name' => $item->get_name(),
                'quantity' => $item->get_quantity(),
                'total' => wc_format_decimal($item->get_total(), 2),
            ];
        }

        $timeline = $order->get_meta(self::TIMELINE_META, true);

        return [
            'orderId' => $order->get_id(),
            'reference' => (string) $order->get_meta('_commerce_reference', true),
            'status' => $order->get_status(),
            'amount' => wc_format_decimal($order->get_total(), 2),
            'currency' => $order->get_currency(),
            'email' => $order->get_billing_email(),
            'holdExpiresAt' => (string) $order->get_meta(
                '_commerce_hold_expires_at',
                true
            ),
            'paymentIntentId' => (string) $order->get_meta(
                '_commerce_payment_intent_id',
                true
            ),
            'items' => $items,
            'timeline' => is_array($timeline) ? array_values($timeline) : [],
        ];
    }

    private static function appendTimeline(
        WC_Order $order,
        string $type,
        string $message
    ): void {
        $timeline = $order->get_meta(self::TIMELINE_META, true);
        if (!is_array($timeline)) {
            $timeline = [];
        }
        $timeline[] = [
            'at' => gmdate(DATE_ATOM),
            'type' => $type,
            'message' => $message,
        ];

        $order->update_meta_data(
            self::TIMELINE_META,
            array_slice($timeline, -100)
        );
    }

    private static function requiredUuid(mixed $value, string $label): string
    {
        $candidate = strtolower(trim((string) $value));
        if (
            !preg_match(
                '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/',
                $candidate
            )
        ) {
            throw new WorkflowError(sprintf('The %s is invalid.', $label), 400);
        }

        return $candidate;
    }

    private static function requiredIdentifier(mixed $value, string $label): string
    {
        $candidate = trim((string) $value);
        if (!preg_match('/^[A-Za-z0-9_:-]{6,255}$/', $candidate)) {
            throw new WorkflowError(sprintf('The %s is invalid.', $label), 400);
        }

        return $candidate;
    }

    private static function requiredEventType(mixed $value): string
    {
        $eventType = trim((string) $value);
        if (
            !in_array(
                $eventType,
                [
                    'payment_intent.succeeded',
                    'payment_intent.payment_failed',
                    'payment_intent.canceled',
                ],
                true
            )
        ) {
            throw new WorkflowError('The payment event type is unsupported.', 400);
        }

        return $eventType;
    }

    private static function requiredAmount(mixed $value): int
    {
        if (!is_int($value) || $value < 1 || $value > 100_000_000) {
            throw new WorkflowError('The payment amount is invalid.', 400);
        }

        return $value;
    }

    private static function requiredCurrency(mixed $value): string
    {
        $currency = strtoupper(trim((string) $value));
        if (!preg_match('/^[A-Z]{3}$/', $currency)) {
            throw new WorkflowError('The payment currency is invalid.', 400);
        }

        return $currency;
    }
}
