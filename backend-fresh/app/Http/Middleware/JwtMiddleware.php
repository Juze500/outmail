<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use UnexpectedValueException;

/**
 * Validates the JWT bearer token on every /api/* route.
 *
 * On success:  sets request->user_id and request->auth_user (User model).
 * On failure:  returns 401 JSON with a machine-readable error code.
 */
class JwtMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $this->extractToken($request);

        if ($token === null) {
            return $this->unauthorized('missing_token', 'No Authorization header provided.');
        }

        try {
            $secret  = config('app.jwt_secret') ?? env('JWT_SECRET');
            $decoded = JWT::decode($token, new Key($secret, 'HS256'));
        } catch (ExpiredException) {
            return $this->unauthorized('token_expired', 'Your session has expired. Please log in again.');
        } catch (UnexpectedValueException $e) {
            return $this->unauthorized('invalid_token', 'The provided token is invalid.');
        }

        $user = User::find($decoded->sub ?? null);

        if ($user === null) {
            return $this->unauthorized('user_not_found', 'Token references a user that no longer exists.');
        }

        // Attach user to the request so downstream controllers can read it.
        $request->merge(['auth_user_id' => $user->id]);
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }

    private function extractToken(Request $request): ?string
    {
        $header = $request->header('Authorization', '');

        if (str_starts_with($header, 'Bearer ')) {
            return substr($header, 7);
        }

        return null;
    }

    private function unauthorized(string $code, string $message): Response
    {
        return response()->json(['error' => $code, 'message' => $message], 401);
    }
}
