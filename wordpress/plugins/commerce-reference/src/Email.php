<?php

declare(strict_types=1);

namespace CommerceReference;

use PHPMailer\PHPMailer\PHPMailer;

final class Email
{
    public static function configure(PHPMailer $mailer): void
    {
        $host = (string) getenv('SMTP_HOST');
        $port = (int) getenv('SMTP_PORT');
        if ($host === '' || $port < 1) {
            return;
        }

        $mailer->isSMTP();
        $mailer->Host = $host;
        $mailer->Port = $port;
        $mailer->SMTPAuth = false;
        $mailer->SMTPSecure = '';
        $mailer->SMTPAutoTLS = false;
    }
}
