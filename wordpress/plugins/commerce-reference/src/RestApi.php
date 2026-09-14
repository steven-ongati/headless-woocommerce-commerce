<?php

declare(strict_types=1);

namespace CommerceReference;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

final class RestApi
{
    private const NAMESPACE = 'commerce-reference/v1';

    public static function register(): void
    {
        register_rest_route(
            self::NAMESPACE,
            '/checkouts',
            [
                'methods' => 'POST',
                'callback' => [self::class, 'createCheckout'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
        register_rest_route(
            self::NAMESPACE,
            '/orders/(?P<reference>ord_[a-f0-9]{32})',
            [
                'methods' => 'GET',
                'callback' => [self::class, 'getOrder'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
        register_rest_route(
            self::NAMESPACE,
            '/orders/(?P<reference>ord_[a-f0-9]{32})/payment',
            [
                'methods' => 'POST',
                'callback' => [self::class, 'attachPayment'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
        register_rest_route(
            self::NAMESPACE,
            '/orders/(?P<reference>ord_[a-f0-9]{32})/cancel',
            [
                'methods' => 'POST',
                'callback' => [self::class, 'cancelOrder'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
        register_rest_route(
            self::NAMESPACE,
            '/payment-events',
            [
                'methods' => 'POST',
                'callback' => [self::class, 'processPaymentEvent'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
        register_rest_route(
            self::NAMESPACE,
            '/operations/metrics',
            [
                'methods' => 'GET',
                'callback' => [self::class, 'getOperationalMetrics'],
                'permission_callback' => [self::class, 'authorize'],
            ]
        );
    }

    public static function authorize(WP_REST_Request $request): true|WP_Error
    {
        $expected = defined('COMMERCE_GATEWAY_SECRET')
            ? (string) COMMERCE_GATEWAY_SECRET
            : '';
        $supplied = (string) $request->get_header('x-commerce-gateway-secret');

        if (
            strlen($expected) < 16 ||
            strlen($supplied) !== strlen($expected) ||
            !hash_equals($expected, $supplied)
        ) {
            return new WP_Error(
                'commerce_gateway_unauthorized',
                'Unauthorized',
                ['status' => 401]
            );
        }

        return true;
    }

    public static function createCheckout(
        WP_REST_Request $request
    ): WP_REST_Response {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            return self::response(
                ['error' => 'The checkout body must be valid JSON.'],
                400
            );
        }

        try {
            $result = OrderWorkflow::createCheckout($payload);
            return self::response($result['body'], $result['status']);
        } catch (WorkflowError $error) {
            return self::response(['error' => $error->getMessage()], $error->status);
        }
    }

    public static function getOrder(WP_REST_Request $request): WP_REST_Response
    {
        try {
            return self::response(
                OrderWorkflow::getOrder(
                    (string) $request['reference'],
                    (string) $request->get_param('cartId')
                )
            );
        } catch (WorkflowError $error) {
            return self::response(['error' => $error->getMessage()], $error->status);
        }
    }

    public static function attachPayment(
        WP_REST_Request $request
    ): WP_REST_Response {
        try {
            return self::response(
                OrderWorkflow::attachPayment(
                    (string) $request['reference'],
                    self::jsonPayload($request)
                )
            );
        } catch (WorkflowError $error) {
            return self::response(['error' => $error->getMessage()], $error->status);
        }
    }

    public static function cancelOrder(
        WP_REST_Request $request
    ): WP_REST_Response {
        try {
            $payload = self::jsonPayload($request);
            return self::response(
                OrderWorkflow::cancelOrder(
                    (string) $request['reference'],
                    (string) ($payload['cartId'] ?? '')
                )
            );
        } catch (WorkflowError $error) {
            return self::response(['error' => $error->getMessage()], $error->status);
        }
    }

    public static function processPaymentEvent(
        WP_REST_Request $request
    ): WP_REST_Response {
        try {
            return self::response(
                OrderWorkflow::processPaymentEvent(self::jsonPayload($request))
            );
        } catch (WorkflowError $error) {
            return self::response(['error' => $error->getMessage()], $error->status);
        } catch (\Throwable $error) {
            return self::response(
                ['error' => 'The payment event could not be processed.'],
                503
            );
        }
    }

    public static function getOperationalMetrics(): WP_REST_Response
    {
        try {
            return self::response(Database::operationalMetrics());
        } catch (\Throwable $error) {
            return self::response(
                ['error' => 'Operational metrics could not be read.'],
                503
            );
        }
    }

    private static function jsonPayload(WP_REST_Request $request): array
    {
        $payload = $request->get_json_params();
        if (!is_array($payload)) {
            throw new WorkflowError('The request body must be valid JSON.', 400);
        }

        return $payload;
    }

    private static function response(
        array $body,
        int $status = 200
    ): WP_REST_Response {
        $response = new WP_REST_Response($body, $status);
        $response->header('Cache-Control', 'private, no-store');
        $requestId = self::requestId();
        if ($requestId !== '') {
            $response->header('X-Request-Id', $requestId);
        }
        error_log(
            wp_json_encode([
                'event' => 'commerce_authority_response',
                'requestId' => $requestId,
                'status' => $status,
            ])
        );

        return $response;
    }

    private static function requestId(): string
    {
        $requestId = trim((string) ($_SERVER['HTTP_X_REQUEST_ID'] ?? ''));
        return preg_match('/^[A-Za-z0-9_-]{8,64}$/', $requestId)
            ? $requestId
            : '';
    }
}
