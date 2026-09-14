export type LoginRequestDto = {
    username: string;
    password: string;
};

/** The signed-in principal. Deliberately carries no hash, no session id, and no token. */
export type AuthUserDto = {
    id: string;
    username: string;
};

export type LoginResponseDto = {
    user: AuthUserDto;
    /** ISO instant at which the session lapses if unused. Slides forward as the app is used. */
    expiresAt: string;
};

export type LogoutResponseDto = {
    ok: boolean;
};
