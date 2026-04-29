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
    | offline_access is mandatory to receive a refresh_token.
    | Mail.ReadWrite covers both reading and moving/deleting messages.
    | Mail.Send is required for the send endpoint.
    */

    'scopes' => [
        'openid',
        'profile',
        'email',
        'offline_access',
        'User.Read',
        'Mail.ReadWrite',
        'Mail.Send',
    ],

];
