<?php

declare(strict_types=1);

namespace CommerceReference;

final class CommerceStory
{
    public const POST_TYPE = 'commerce_story';

    public static function register(): void
    {
        register_post_type(
            self::POST_TYPE,
            [
                'labels' => [
                    'name' => __('Field Notes', 'commerce-reference'),
                    'singular_name' => __('Field Note', 'commerce-reference'),
                    'add_new_item' => __('Add Field Note', 'commerce-reference'),
                    'edit_item' => __('Edit Field Note', 'commerce-reference'),
                ],
                'public' => true,
                'show_in_rest' => true,
                'show_in_graphql' => true,
                'graphql_single_name' => 'fieldNote',
                'graphql_plural_name' => 'fieldNotes',
                'has_archive' => true,
                'rewrite' => ['slug' => 'field-notes'],
                'menu_icon' => 'dashicons-book-alt',
                'supports' => ['title', 'editor', 'excerpt', 'revisions', 'thumbnail'],
            ]
        );
    }
}
