<?php
/**
 * Plugin Name: Commerce Reference
 * Description: Domain content, storefront GraphQL fields, preview isolation, and deterministic fixtures.
 * Version: 0.1.0
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
require_once __DIR__ . '/src/GraphQLSchema.php';
require_once __DIR__ . '/src/Seeder.php';

add_action('init', ['CommerceReference\\CommerceStory', 'register']);
add_action('graphql_register_types', ['CommerceReference\\GraphQLSchema', 'register']);

if (defined('WP_CLI') && WP_CLI) {
    WP_CLI::add_command('commerce-reference seed', ['CommerceReference\\Seeder', 'seed']);
}
