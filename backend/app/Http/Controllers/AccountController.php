<?php

namespace App\Http\Controllers;

use App\Models\ConnectedAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountController extends Controller
{
    // GET /api/accounts
    public function index(Request $request): JsonResponse
    {
        $accounts = ConnectedAccount::where('user_id', $request->input('auth_user_id'))
            ->orderByDesc('is_primary')
            ->orderBy('created_at')
            ->get()
            ->map(fn ($a) => $this->publicPayload($a));

        return response()->json(['accounts' => $accounts]);
    }

    // DELETE /api/accounts/{id}
    public function destroy(Request $request, int $id): JsonResponse
    {
        $account = ConnectedAccount::where('id', $id)
            ->where('user_id', $request->input('auth_user_id'))
            ->first();

        if ($account === null) {
            return response()->json([
                'error'   => 'not_found',
                'message' => 'Account not found or does not belong to you.',
            ], 404);
        }

        $account->delete();

        return response()->json(['message' => 'Account disconnected successfully.']);
    }

    private function publicPayload(ConnectedAccount $a): array
    {
        return [
            'id'           => $a->id,
            'email'        => $a->email,
            'display_name' => $a->display_name,
            'avatar_url'   => $a->avatar_url,
            'is_primary'   => $a->is_primary,
            'created_at'   => $a->created_at?->toISOString(),
        ];
    }
}
