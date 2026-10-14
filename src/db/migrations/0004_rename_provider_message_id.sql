-- Provider-neutral name: emails now go through Brevo, not Resend.
ALTER TABLE "notifications_log" RENAME COLUMN "resend_id" TO "provider_message_id";
