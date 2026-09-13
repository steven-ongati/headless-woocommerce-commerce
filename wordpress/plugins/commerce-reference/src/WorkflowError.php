<?php

declare(strict_types=1);

namespace CommerceReference;

final class WorkflowError extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status
    ) {
        parent::__construct($message);
    }
}
