// The Google sign-in in the iOS app (02.11.2026): Apple's sign-in sheet (ASWebAuthenticationSession) instead of the
// plain browser sheet – that one stayed white on the iPad when Google sent the player back to the app's own address
// (de.moescheit.golfos://auth#access_token=…). This sheet is made for it: it ends by itself on that address and hands
// it to the page (src/lib/native.ts openSignIn), which keeps the tokens.

#if os(iOS)
import AuthenticationServices
import Capacitor
import Foundation
import UIKit

@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?

    /// start({ url, scheme }) → { url }: the address the sign-in came back with; "CANCELLED" when the player closed it.
    @objc func start(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), let scheme = call.getString("scheme") else {
            return call.reject("url and scheme needed")
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] back, error in
                self?.session = nil
                if let back = back {
                    call.resolve(["url": back.absoluteString])
                } else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("cancelled", "CANCELLED")
                } else {
                    call.reject(error?.localizedDescription ?? "sign-in failed", "FAILED")
                }
            }
            session.presentationContextProvider = self
            // the Google account of Safari is offered (no new login on every phone)
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("the sign-in sheet did not open", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
#endif
