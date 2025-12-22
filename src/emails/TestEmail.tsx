// emails/TestEmail.tsx
import * as React from "react";

export default function TestEmail({
  previewText = "SmartSend test delivery",
  body = "If you can read this, your test email works!",
}: {
  previewText?: string;
  body?: string;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>SmartSend Test</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Preview text */}
        <meta name="x-apple-disable-message-reformatting" />
      </head>
      <body style={{ margin: 0, backgroundColor: "#0b0b0c", color: "#ffffff" }}>
        <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
          <tbody>
            <tr>
              <td style={{ padding: "32px 0" }} align="center">
                <table
                  width="600"
                  cellPadding={0}
                  cellSpacing={0}
                  role="presentation"
                  style={{
                    width: "100%",
                    background: "#111213",
                    borderRadius: 16,
                    border: "1px solid #1f2124",
                    overflow: "hidden",
                    fontFamily:
                      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: 24, textAlign: "center", borderBottom: "1px solid #1f2124" }}>
                        <div style={{ fontSize: 18, opacity: 0.9 }}>⚡ SmartSend</div>
                        <div style={{ fontSize: 12, color: "#9aa0a6", marginTop: 4 }}>{previewText}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: 24, lineHeight: 1.6, fontSize: 16 }}>
                        <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{body}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: 16, textAlign: "center", borderTop: "1px solid #1f2124", color: "#9aa0a6", fontSize: 12 }}>
                        © {new Date().getFullYear()} SmartSend AI
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ height: 24 }} />
                <div style={{ color: "#9aa0a6", fontSize: 12 }}>
                  You're receiving this because you requested a test from SmartSend.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}