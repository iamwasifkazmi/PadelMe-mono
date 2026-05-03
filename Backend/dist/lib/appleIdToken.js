import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
const appleJwks = jwksClient({
    jwksUri: "https://appleid.apple.com/auth/keys",
    cache: true,
    cacheMaxAge: 86_400_000,
});
function appleSigningKey(header, callback) {
    if (!header.kid) {
        callback(new Error("Apple token missing kid"));
        return;
    }
    appleJwks.getSigningKey(header.kid, (err, key) => {
        if (err || !key) {
            callback(err ?? new Error("Apple JWKS key not found"));
            return;
        }
        callback(null, key.getPublicKey());
    });
}
/** Verify native Sign in with Apple identity token; `aud` must match bundle ID (APPLE_CLIENT_ID). */
export function verifyAppleIdentityToken(idToken, audience) {
    return new Promise((resolve, reject) => {
        jwt.verify(idToken, appleSigningKey, {
            algorithms: ["RS256"],
            issuer: "https://appleid.apple.com",
            audience,
        }, (err, decoded) => {
            if (err)
                reject(err);
            else
                resolve(decoded);
        });
    });
}
export function appleEmailVerifiedClaim(v) {
    return v === true || v === "true";
}
