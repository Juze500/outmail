<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use App\Services\GraphApiService;
use App\Services\TokenEncryptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BulkMailController extends Controller
{
    public function __construct(
        private GraphApiService        $graph,
        private TokenEncryptionService $encryption,
    ) {}

    /**
     * POST /api/bulk/parse
     *
     * Upload a CSV / plain-text file and return all valid email addresses found
     * inside it.  Used by the legacy plain-text import path.
     */
    public function parse(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt|max:5120',
        ]);

        $contents = file_get_contents($request->file('file')->getPathname());

        preg_match_all('/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/', $contents, $matches);
        $emails = array_values(array_unique($matches[0]));

        return response()->json(['emails' => $emails, 'count' => count($emails)]);
    }

    /**
     * POST /api/admin/bulk/send
     *
     * Send one personalised email per recipient.
     *
     * Recipient format — each item in the `recipients` array may be:
     *
     *   (a) A plain string:           "user@example.com"
     *       → uses the top-level `subject` and `body` fields.
     *
     *   (b) An object with resolved fields:
     *       { "email": "user@example.com", "subject": "…", "body": "…" }
     *       → per-recipient subject/body take priority; falls back to top-level.
     *
     * Templates are resolved on the frontend before this endpoint is called,
     * so no server-side variable substitution is needed.
     */
    public function send(Request $request): JsonResponse
    {
        $accountId  = (int) $request->input('account_id');
        $recipients = $request->input('recipients', []);

        // Global fallback subject/body (used when recipient is a plain string)
        $globalSubject = trim($request->input('subject', ''));
        $globalBody    = $request->input('body', '');

        if (empty($recipients)) {
            return response()->json(['error' => 'No recipients provided.'], 422);
        }

        // Admin panel: any connected account may be used — no user_id restriction.
        $account = ConnectedAccount::find($accountId);

        if (! $account) {
            return response()->json(['error' => 'Account not found.'], 404);
        }

        $token  = $this->encryption->decrypt($account->access_token);
        $sent   = 0;
        $failed = [];

        foreach ($recipients as $recipient) {
            // Normalise to array
            if (is_string($recipient)) {
                $email   = trim($recipient);
                $subject = $globalSubject;
                $body    = $globalBody;
            } else {
                $email   = trim($recipient['email'] ?? '');
                $subject = $recipient['subject'] ?? $globalSubject;
                $body    = $recipient['body']    ?? $globalBody;
            }

            if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $failed[] = ['email' => $email ?: '(empty)', 'reason' => 'Invalid email address'];
                continue;
            }

            if (empty($subject)) {
                $failed[] = ['email' => $email, 'reason' => 'Subject is empty'];
                continue;
            }

            try {
                $this->graph->sendMail($token, [
                    'message' => [
                        'subject' => $subject,
                        'body'    => ['contentType' => 'HTML', 'content' => $body],
                        'toRecipients' => [['emailAddress' => ['address' => $email]]],
                    ],
                    'saveToSentItems' => true,
                ]);
                $sent++;
            } catch (\Throwable $e) {
                $failed[] = ['email' => $email, 'reason' => $e->getMessage()];
            }
        }

        return response()->json([
            'sent'   => $sent,
            'failed' => $failed,
            'total'  => count($recipients),
        ]);
    }
}
