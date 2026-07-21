package com.carpawl.app;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/**
 * @capgo/capacitor-social-login requires this opt-in: requesting any Google
 * scope beyond the basic email/profile default (we request drive.appdata for
 * Drive sync) goes through Android's Identity Authorization API, whose result
 * arrives here in onActivityResult rather than through the plugin's normal
 * bridge dispatch. The plugin refuses to request extra scopes unless this
 * activity both implements the marker interface below AND forwards the
 * result to SocialLoginPlugin.handleGoogleLoginIntent().
 */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Marker method required by the plugin's setup check - intentionally empty.
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        PluginHandle handle = getBridge().getPlugin("SocialLogin");
        if (handle != null && handle.getInstance() instanceof SocialLoginPlugin) {
            ((SocialLoginPlugin) handle.getInstance()).handleGoogleLoginIntent(requestCode, data);
        }
    }
}
