<?php

namespace App\Http\Controllers;

use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    // -------------------------------------------------------------------------
    // POST /api/auth/register
    // -------------------------------------------------------------------------
    public function register(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'name'     => 'required|string|max:255',
                'email'    => 'required|email|max:255|unique:users,email',
                'password' => 'required|string|min:8|confirmed',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $user = User::create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $this->generateJwt($user),
        ], 201);
    }

    // -------------------------------------------------------------------------
    // POST /api/auth/login
    // -------------------------------------------------------------------------
    public function login(Request $request): JsonResponse
    {
        try {
            $data = $request->validate([
                'email'    => 'required|email',
                'password' => 'required|string',
            ]);
        } catch (ValidationException $e) {
            return response()->json([
                'error'   => 'validation_failed',
                'message' => 'The given data was invalid.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $user = User::where('email', $data['email'])->first();

        if ($user === null || !Hash::check($data['password'], $user->password)) {
            return response()->json([
                'error'   => 'invalid_credentials',
                'message' => 'Email or password is incorrect.',
            ], 401);
        }

        return response()->json([
            'user'  => $this->userPayload($user),
            'token' => $this->generateJwt($user),
        ]);
    }

    // -------------------------------------------------------------------------
    // GET /api/auth/me  (protected by JwtMiddleware)
    // -------------------------------------------------------------------------
    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userPayload($request->user())]);
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function generateJwt(User $user): string
    {
        $secret  = config('app.jwt_secret') ?? env('JWT_SECRET');
        $ttl     = (int) (config('app.jwt_ttl_minutes') ?? env('JWT_TTL_MINUTES', 1440));
        $now     = time();

        $payload = [
            'iss' => config('app.url'),
            'iat' => $now,
            'exp' => $now + ($ttl * 60),
            'sub' => $user->id,
        ];

        return JWT::encode($payload, $secret, 'HS256');
    }

    private function userPayload(User $user): array
    {
        return [
            'id'         => $user->id,
            'name'       => $user->name,
            'email'      => $user->email,
            'created_at' => $user->created_at?->toISOString(),
        ];
    }
}
