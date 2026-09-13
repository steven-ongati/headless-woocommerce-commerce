<?php
/**
 * Plugin Name: Commerce Reference
 * Description: Domain content, storefront projections, durable checkout commands, and deterministic fixtures.
 * Version: 0.3.1
 * Requires at least: 6.8
 * Requires PHP: 8.3
 * Author: Steven Ongati
 * License: GPL-2.0-or-later
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/src/CommerceStory.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Email.php';
require_once __DIR__ . '/src/GraphQLSchema.php';
require_once __DIR__ . '/src/WorkflowError.php';
require_once __DIR__ . '/src/OrderWorkflow.php';
require_once __DIR__ . '/src/RestApi.php';
require_once __DIR__ . '/src/Seeder.php';

add_action('plugins_loaded', ['CommerceReference\\Database', 'maybeInstall']);
add_action('init', ['CommerceReference\\CommerceStory', 'register']);
add_action('phpmailer_init', ['CommerceReference\\Email', 'configure']);
add_action('graphql_register_types', ['CommerceReference\\GraphQLSchema', 'register']);
add_action('rest_api_init', ['CommerceReference\\RestApi', 'register']);

if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::add_command('commerce-reference seed', ['CommerceReference\\Seeder', 'seed']);
}
