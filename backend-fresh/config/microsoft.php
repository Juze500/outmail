<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Microsoft Azure App Registration credentials
    |--------------------------------------------------------------------------
    | These map directly to the values from portal.azure.com.
    | MICROSOFT_TENANT_ID defaults to "common" which allows both personal
    | Microsoft accounts and work/school (Azure AD) accounts. Change to your
    | specific tenant ID if you only want organizational accounts.
    */

    'client_id'     => env('MICROSOFT_CLIENT_ID'),
    'client_secret' => env('MICROSOFT_CLIENT_SECRET'),
    'tenant_id'     => env('MICROSOFT_TENANT_ID', 'common'),
    'redirect_uri'  => env('MICROSOFT_REDIRECT_URI'),

    /*
    |--------------------------------------------------------------------------
    | OAuth 2.0 scopes requested from the user
    |--------------------------------------------------------------------------
    | All scopes below are DELEGATED permissions — they act on behalf of the
    | signed-in user and never require admin consent, even on organisational
    | (work/school) tenants.
    |
    | openid              — standard OIDC sign-in token
    | offline_access      — receive a refresh_token so sessions stay alive
    | User.Read           — read the user's profile (name, email, photo)
    | Mail.Read           — read inbox and messages (read-only, no admin needed)
    | MailboxSettings.ReadWrite — read/write Out-of-Office and display name
    |                             (delegated — no admin consent required)
    */

    // 'scopes' => [
    //     'openid',
    //     'offline_access',
    //     'User.Read',
    //     'Mail.Read',
    //     'MailboxSettings.ReadWrite',
    // ],

    'scopes' => [
    'openid',
    'offline_access',
    'User.Read',
    'Mail.Read',
]

];
