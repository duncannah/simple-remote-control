package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

func newFlashKey() ([]byte, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	return key, nil
}

func redirectWithMessage(w http.ResponseWriter, r *http.Request, flashKey []byte, level, message string) {
	setFlashMessage(w, flashKey, level, message)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func setFlashMessage(w http.ResponseWriter, flashKey []byte, level, message string) {
	payloadBytes, err := json.Marshal(PageData{
		Level:   level,
		Message: message,
	})
	if err != nil {
		return
	}

	payload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	mac := hmac.New(sha256.New, flashKey)
	mac.Write([]byte(payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	cookieValue := payload + "." + signature

	http.SetCookie(w, &http.Cookie{
		Name:     flashCookieName,
		Value:    cookieValue,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func popFlashMessage(w http.ResponseWriter, r *http.Request, flashKey []byte) (string, string) {
	cookie, err := r.Cookie(flashCookieName)
	if err != nil {
		return "", ""
	}

	clearFlashCookie(w)

	payload, signature, ok := strings.Cut(cookie.Value, ".")
	if !ok {
		return "", ""
	}

	mac := hmac.New(sha256.New, flashKey)
	mac.Write([]byte(payload))
	expectedSig := mac.Sum(nil)

	decodedSig, err := base64.RawURLEncoding.DecodeString(signature)
	if err != nil || !hmac.Equal(decodedSig, expectedSig) {
		return "", ""
	}

	decodedPayload, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		return "", ""
	}

	var data PageData
	if err := json.Unmarshal(decodedPayload, &data); err != nil {
		return "", ""
	}

	return data.Level, data.Message
}

func clearFlashCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     flashCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
