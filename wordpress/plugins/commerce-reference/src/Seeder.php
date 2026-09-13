<?php

declare(strict_types=1);

namespace CommerceReference;

use WC_Product_Simple;

final class Seeder
{
    private const PRODUCTS = [
        [
            'sku' => 'NS-TRAIL-001',
            'name' => 'Ridgeline Field Pack',
            'slug' => 'ridgeline-field-pack',
            'price' => '148.00',
            'stock' => 18,
            'category' => 'Carry',
            'short_description' => 'A balanced 28-litre pack for day routes and light overnights.',
            'description' => 'Waxed recycled shell, repairable hardware, and a suspended laptop sleeve keep this pack useful from trailhead to train platform.',
            'featured' => true,
        ],
        [
            'sku' => 'NS-LIGHT-002',
            'name' => 'Waypoint Lantern',
            'slug' => 'waypoint-lantern',
            'price' => '72.00',
            'stock' => 34,
            'category' => 'Camp',
            'short_description' => 'A warm, dimmable lantern with a replaceable battery module.',
            'description' => 'Three light temperatures and a low-glare shade make the Waypoint equally at home on a campsite table or during a power cut.',
            'featured' => true,
        ],
        [
            'sku' => 'NS-MUG-003',
            'name' => 'Switchback Camp Mug',
            'slug' => 'switchback-camp-mug',
            'price' => '34.00',
            'stock' => 52,
            'category' => 'Camp',
            'short_description' => 'Double-wall steel with a ceramic-lined interior.',
            'description' => 'A press-fit lid, folding handle, and ceramic lining preserve the ritual without carrying the weight of a kitchen mug.',
            'featured' => false,
        ],
        [
            'sku' => 'NS-SHELL-004',
            'name' => 'Crosswind Shell',
            'slug' => 'crosswind-shell',
            'price' => '186.00',
            'stock' => 11,
            'category' => 'Wear',
            'short_description' => 'A quiet three-layer shell cut for movement and repair.',
            'description' => 'Mechanical venting, field-replaceable pulls, and a restrained silhouette provide weather protection without disposable details.',
            'featured' => true,
        ],
    ];

    private const STORIES = [
        [
            'slug' => 'designing-for-the-repair-bench',
            'title' => 'Designed for the repair bench',
            'excerpt' => 'Why replaceable hardware matters long after launch day.',
            'content' => '<p>Durability is not a finish applied at the end. We start with the parts most likely to wear, then make those parts reachable, replaceable, and documented.</p><p>This synthetic field note demonstrates WordPress editorial ownership and revision-ready content in the headless storefront.</p>',
        ],
        [
            'slug' => 'a-weekend-with-less',
            'title' => 'A weekend with less',
            'excerpt' => 'A field list built around deliberate constraints.',
            'content' => '<p>The useful kit is the kit that earns its place. This route pairs a compact carry system with equipment that works across changing conditions.</p><p>Every product and story in this reference implementation is fictional.</p>',
        ],
    ];

    public static function seed(): void
    {
        self::assertDependencies();
        self::seedProducts();
        self::seedStories();

        if (defined('WP_CLI') && WP_CLI) {
            \WP_CLI::success(
                sprintf(
                    'Seeded %d products and %d field notes.',
                    count(self::PRODUCTS),
                    count(self::STORIES)
                )
            );
        }
    }

    private static function assertDependencies(): void
    {
        if (!class_exists(WC_Product_Simple::class)) {
            throw new \RuntimeException('WooCommerce must be active before seeding.');
        }
    }

    private static function seedProducts(): void
    {
        foreach (self::PRODUCTS as $position => $fixture) {
            $productId = wc_get_product_id_by_sku($fixture['sku']);
            $product = $productId > 0 ? wc_get_product($productId) : new WC_Product_Simple();

            if (!$product instanceof WC_Product_Simple) {
                throw new \RuntimeException(
                    sprintf('SKU %s exists but is not a simple product.', $fixture['sku'])
                );
            }

            $categoryId = self::ensureProductCategory($fixture['category']);

            $product->set_name($fixture['name']);
            $product->set_slug($fixture['slug']);
            $product->set_sku($fixture['sku']);
            $product->set_status('publish');
            $product->set_catalog_visibility('visible');
            $product->set_description($fixture['description']);
            $product->set_short_description($fixture['short_description']);
            $product->set_regular_price($fixture['price']);
            $product->set_price($fixture['price']);
            $product->set_manage_stock(true);
            $product->set_stock_quantity($fixture['stock']);
            $product->set_stock_status('instock');
            $product->set_category_ids([$categoryId]);
            $product->set_featured($fixture['featured']);
            $product->set_menu_order($position);
            $product->save();
        }
    }

    private static function ensureProductCategory(string $name): int
    {
        $term = term_exists($name, 'product_cat');

        if (is_array($term)) {
            return (int) $term['term_id'];
        }

        if (is_int($term)) {
            return $term;
        }

        $created = wp_insert_term($name, 'product_cat');
        if (is_wp_error($created)) {
            throw new \RuntimeException($created->get_error_message());
        }

        return (int) $created['term_id'];
    }

    private static function seedStories(): void
    {
        foreach (self::STORIES as $fixture) {
            $existing = get_page_by_path(
                $fixture['slug'],
                OBJECT,
                CommerceStory::POST_TYPE
            );

            $postId = wp_insert_post(
                [
                    'ID' => $existing instanceof \WP_Post ? $existing->ID : 0,
                    'post_type' => CommerceStory::POST_TYPE,
                    'post_status' => 'publish',
                    'post_name' => $fixture['slug'],
                    'post_title' => $fixture['title'],
                    'post_excerpt' => $fixture['excerpt'],
                    'post_content' => $fixture['content'],
                ],
                true
            );

            if (is_wp_error($postId)) {
                throw new \RuntimeException($postId->get_error_message());
            }
        }
    }
}
