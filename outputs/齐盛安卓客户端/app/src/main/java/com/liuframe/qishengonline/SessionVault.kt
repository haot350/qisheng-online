package com.liuframe.qishengonline

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionVault(context: Context) {
    private val prefs = context.getSharedPreferences("account_session", Context.MODE_PRIVATE)
    private val alias = "liuframe.qishengonline.session.v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        }.generateKey()
    }
    @Synchronized fun read(): String {
        val encoded = prefs.getString("encrypted", null) ?: return ""
        return try {
            val row = JSONObject(encoded)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(row.getString("iv"), Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(row.getString("data"), Base64.NO_WRAP)), Charsets.UTF_8)
        } catch (_: Exception) { prefs.edit().remove("encrypted").commit(); "" }
    }
    @Synchronized fun write(value: String) {
        require(value.length <= 4096)
        if (value.isEmpty()) { check(prefs.edit().remove("encrypted").commit()); return }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        val row = JSONObject().put("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP)).put("data", Base64.encodeToString(bytes, Base64.NO_WRAP))
        check(prefs.edit().putString("encrypted", row.toString()).commit())
    }
}
