<?php

declare(strict_types=1);

namespace CommerceReference;

use GraphQL\Error\UserError;
final class GraphQLSchema
{
    public static function register(): void
    {
        register_graphql_object_type(
            'CommerceProduct',
            [
                'description' => __('A storefront projection of an authoritative WooCommerce product.', 'commerce-reference'),
                'fields' => [
                    'databaseId' => ['type' => ['non_null' => 'Int']],
                    'sku' => ['type' => ['non_null' => 'String']],
                    'name' => ['type' => ['non_null' => 'String']],
                    'slug' => ['type' => ['non_null' => 'String']],
                    'description' => ['type' => ['non_null' => 'String']],
                    'shortDescription' => ['type' => ['non_null' => 'String']],
                    'price' => ['type' => ['non_null' => 'String']],
                    'regularPrice' => ['type' => ['non_null' => 'String']],
                    'currency' => ['type' => ['non_null' => 'String']],
                    'stockStatus' => ['type' => ['non_null' => 'String']],
                    'categories' => ['type' => ['list_of' => 'String']],
                    'featured' => ['type' => ['non_null' => 'Boolean']],
                    'modified' => ['type' => ['non_null' => 'String']],
                ],
            ]
        );

        register_graphql_object_type(
            'CommerceStoryProjection',
            [
                'description' => __('A storefront projection of a WordPress field note.', 'commerce-reference'),
                'fields' => [
                    'databaseId' => ['type' => ['non_null' => 'Int']],
                    'slug' => ['type' => ['non_null' => 'String']],
                    'title' => ['type' => ['non_null' => 'String']],
                    'excerpt' => ['type' => ['non_null' => 'String']],
                    'content' => ['type' => ['non_null' => 'String']],
                    'date' => ['type' => ['non_null' => 'String']],
                    'modified' => ['type' => ['non_null' => 'String']],
                ],
            ]
        );

        register_graphql_field(
            'RootQuery',
            'commerceCatalog',
            [
                'type' => ['list_of' => 'CommerceProduct'],
                'description' => __('Published WooCommerce products for the headless storefront.', 'commerce-reference'),
                'args' => [
                        'limit' => [
                            'type' => 'Int',
                            'defaultValue' => 12,
                        ],
                        'offset' => [
                            'type' => 'Int',
                            'defaultValue' => 0,
                        ],
                    ],
                    'resolve' => static function ($root, array $args): array {
                        $limit = max(1, min(50, (int) ($args['limit'] ?? 12)));
                        $offset = max(0, (int) ($args['offset'] ?? 0));

                        return array_map(
                            [self::class, 'projectProduct'],
                            wc_get_products([
                                'limit' => $limit,
                                'offset' => $offset,
                                'status' => 'publish',
                            'orderby' => 'menu_order',
                            'order' => 'ASC',
                        ])
                    );
                },
            ]
        );

        register_graphql_field(
            'RootQuery',
            'commerceStoryPreview',
            [
                'type' => 'CommerceStoryProjection',
                'description' => __('A field note resolved through an optional server-side preview credential.', 'commerce-reference'),
                'args' => [
                    'slug' => ['type' => ['non_null' => 'String']],
                    'previewToken' => ['type' => 'String'],
                ],
                'resolve' => static function ($root, array $args): ?array {
                    $isPreview = self::isValidPreviewToken((string) ($args['previewToken'] ?? ''));
                    $posts = get_posts([
                        'name' => sanitize_title((string) $args['slug']),
                        'post_type' => CommerceStory::POST_TYPE,
                        'post_status' => $isPreview ? ['publish', 'draft', 'pending', 'future'] : ['publish'],
                        'numberposts' => 1,
                    ]);

                    if ($posts === []) {
                        return null;
                    }

                    return self::projectStory($posts[0]);
                },
            ]
        );
    }

    public static function projectProduct(\WC_Product $product): array
    {
        $categoryNames = wp_get_post_terms(
            $product->get_id(),
            'product_cat',
            ['fields' => 'names']
        );

        return [
            'databaseId' => $product->get_id(),
            'sku' => $product->get_sku(),
            'name' => $product->get_name(),
            'slug' => $product->get_slug(),
            'description' => wp_strip_all_tags($product->get_description()),
            'shortDescription' => wp_strip_all_tags($product->get_short_description()),
            'price' => $product->get_price(),
            'regularPrice' => $product->get_regular_price(),
            'currency' => get_woocommerce_currency(),
            'stockStatus' => $product->get_stock_status(),
            'categories' => is_wp_error($categoryNames) ? [] : $categoryNames,
            'featured' => $product->is_featured(),
            'modified' => $product->get_date_modified()?->date(DATE_ATOM) ?? '',
        ];
    }

    public static function projectStory(\WP_Post $post): array
    {
        return [
            'databaseId' => $post->ID,
            'slug' => $post->post_name,
            'title' => get_the_title($post),
            'excerpt' => wp_strip_all_tags(get_the_excerpt($post)),
            'content' => apply_filters('the_content', $post->post_content),
            'date' => get_post_time(DATE_ATOM, true, $post),
            'modified' => get_post_modified_time(DATE_ATOM, true, $post),
        ];
    }

    private static function isValidPreviewToken(string $token): bool
    {
        if ($token === '') {
            return false;
        }

        if (!defined('COMMERCE_PREVIEW_SECRET')) {
            throw new UserError(__('Preview is not configured.', 'commerce-reference'));
        }

        return hash_equals((string) COMMERCE_PREVIEW_SECRET, $token);
    }
}
