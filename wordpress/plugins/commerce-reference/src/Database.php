<?php

declare(strict_types=1);

namespace CommerceReference;

final class Database
{
    private const SCHEMA_VERSION = '0.3.0';
    private const SCHEMA_OPTION = 'commerce_reference_schema_version';

    public static function maybeInstall(): void
    {
        if (get_option(self::SCHEMA_OPTION) === self::SCHEMA_VERSION) {
            return;
        }

        self::install();
    }

    public static function install(): void
    {
        global $wpdb;

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charsetCollate = $wpdb->get_charset_collate();
        $checkoutTable = self::checkoutTable();
        $eventTable = self::eventTable();

        dbDelta(
            "CREATE TABLE {$checkoutTable} (
                idempotency_key varchar(64) NOT NULL,
                request_hash char(64) NOT NULL,
                order_id bigint unsigned NULL,
                state varchar(32) NOT NULL,
                http_status smallint unsigned NULL,
                response longtext NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (idempotency_key),
                KEY order_id (order_id)
            ) {$charsetCollate};"
        );

        dbDelta(
            "CREATE TABLE {$eventTable} (
                event_key char(64) NOT NULL,
                provider_event_id varchar(255) NOT NULL,
                payment_intent_id varchar(255) NOT NULL,
                event_type varchar(100) NOT NULL,
                payload_hash char(64) NOT NULL,
                order_id bigint unsigned NULL,
                state varchar(32) NOT NULL,
                error_message text NULL,
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL,
                PRIMARY KEY  (event_key),
                KEY payment_intent_id (payment_intent_id),
                KEY order_id (order_id)
            ) {$charsetCollate};"
        );

        update_option(self::SCHEMA_OPTION, self::SCHEMA_VERSION, false);
    }

    public static function claimCheckout(
        string $idempotencyKey,
        string $requestHash
    ): bool {
        global $wpdb;

        $now = gmdate('Y-m-d H:i:s');
        $result = $wpdb->query(
            $wpdb->prepare(
                'INSERT IGNORE INTO ' . self::checkoutTable() . '
                    (idempotency_key, request_hash, state, created_at, updated_at)
                 VALUES (%s, %s, %s, %s, %s)',
                $idempotencyKey,
                $requestHash,
                'received',
                $now,
                $now
            )
        );

        if ($result === false) {
            throw new \RuntimeException('The checkout command could not be recorded.');
        }

        return $result === 1;
    }

    public static function getCheckout(string $idempotencyKey): ?array
    {
        global $wpdb;

        $record = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM ' . self::checkoutTable() . ' WHERE idempotency_key = %s',
                $idempotencyKey
            ),
            ARRAY_A
        );

        return is_array($record) ? $record : null;
    }

    public static function completeCheckout(
        string $idempotencyKey,
        ?int $orderId,
        string $state,
        int $httpStatus,
        array $response
    ): void {
        global $wpdb;

        $updated = $wpdb->update(
            self::checkoutTable(),
            [
                'order_id' => $orderId,
                'state' => $state,
                'http_status' => $httpStatus,
                'response' => wp_json_encode($response),
                'updated_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['idempotency_key' => $idempotencyKey],
            ['%d', '%s', '%d', '%s', '%s'],
            ['%s']
        );

        if ($updated === false) {
            throw new \RuntimeException('The checkout result could not be recorded.');
        }
    }

    public static function claimEvent(
        string $eventKey,
        string $providerEventId,
        string $paymentIntentId,
        string $eventType,
        string $payloadHash
    ): bool {
        global $wpdb;

        $now = gmdate('Y-m-d H:i:s');
        $result = $wpdb->query(
            $wpdb->prepare(
                'INSERT IGNORE INTO ' . self::eventTable() . '
                    (event_key, provider_event_id, payment_intent_id, event_type, payload_hash, state, created_at, updated_at)
                 VALUES (%s, %s, %s, %s, %s, %s, %s, %s)',
                $eventKey,
                $providerEventId,
                $paymentIntentId,
                $eventType,
                $payloadHash,
                'received',
                $now,
                $now
            )
        );

        if ($result === false) {
            throw new \RuntimeException('The payment event could not be recorded.');
        }

        return $result === 1;
    }

    public static function getEvent(string $eventKey): ?array
    {
        global $wpdb;

        $record = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM ' . self::eventTable() . ' WHERE event_key = %s',
                $eventKey
            ),
            ARRAY_A
        );

        return is_array($record) ? $record : null;
    }

    public static function completeEvent(
        string $eventKey,
        ?int $orderId,
        string $state,
        string $errorMessage = ''
    ): void {
        global $wpdb;

        $updated = $wpdb->update(
            self::eventTable(),
            [
                'order_id' => $orderId,
                'state' => $state,
                'error_message' => $errorMessage,
                'updated_at' => gmdate('Y-m-d H:i:s'),
            ],
            ['event_key' => $eventKey],
            ['%d', '%s', '%s', '%s'],
            ['%s']
        );

        if ($updated === false) {
            throw new \RuntimeException('The payment event result could not be recorded.');
        }
    }

    public static function operationalMetrics(): array
    {
        global $wpdb;

        $checkout = $wpdb->get_row(
            'SELECT
                COUNT(*) AS total,
                COALESCE(SUM(state = "received"), 0) AS pending,
                COALESCE(SUM(state = "failed"), 0) AS failed,
                COALESCE(SUM(state = "failed" AND http_status = 409), 0) AS conflicts,
                COALESCE(MAX(
                    CASE
                        WHEN state = "received"
                        THEN TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())
                        ELSE 0
                    END
                ), 0) AS oldestPendingAgeSeconds,
                COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, updated_at)), 0)
                    AS maxProcessingSeconds
            FROM ' . self::checkoutTable(),
            ARRAY_A
        );
        $callbacks = $wpdb->get_row(
            'SELECT
                COUNT(*) AS total,
                COALESCE(SUM(state = "received"), 0) AS pending,
                COALESCE(SUM(state = "failed"), 0) AS failed,
                COALESCE(MAX(
                    CASE
                        WHEN state = "received"
                        THEN TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP())
                        ELSE 0
                    END
                ), 0) AS oldestPendingAgeSeconds,
                COALESCE(MAX(TIMESTAMPDIFF(SECOND, created_at, updated_at)), 0)
                    AS maxProcessingSeconds
            FROM ' . self::eventTable(),
            ARRAY_A
        );

        if (!is_array($checkout) || !is_array($callbacks)) {
            throw new \RuntimeException('Operational metrics could not be read.');
        }

        return [
            'checkout' => self::integerMetrics($checkout),
            'callbacks' => self::integerMetrics($callbacks),
        ];
    }

    private static function integerMetrics(array $metrics): array
    {
        return array_map(
            static fn (mixed $value): int => (int) $value,
            $metrics
        );
    }

    private static function checkoutTable(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'commerce_checkout_commands';
    }

    private static function eventTable(): string
    {
        global $wpdb;

        return $wpdb->prefix . 'commerce_payment_events';
    }
}
