import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from app.config import settings

def send_verification_email(to_email: str, code: str, full_name: str):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "CleanAI+ - Verify Your Account"
    msg["From"] = f"CleanAI+ <{settings.sender_email}>"
    msg["To"] = to_email

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f4f7f6;
                margin: 0;
                padding: 0;
            }}
            .container {{
                max-width: 600px;
                margin: 40px auto;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }}
            .header {{
                background-color: #4f46e5;
                color: #ffffff;
                padding: 30px 20px;
                text-align: center;
            }}
            .header h1 {{
                margin: 0;
                font-size: 24px;
                font-weight: 600;
            }}
            .content {{
                padding: 40px 30px;
                color: #333333;
                line-height: 1.6;
            }}
            .content p {{
                margin-bottom: 20px;
                font-size: 16px;
            }}
            .code-container {{
                text-align: center;
                margin: 30px 0;
            }}
            .code {{
                display: inline-block;
                font-size: 32px;
                font-weight: bold;
                color: #4f46e5;
                letter-spacing: 5px;
                padding: 15px 30px;
                background-color: #f3f4f6;
                border-radius: 8px;
                border: 2px dashed #4f46e5;
            }}
            .button-container {{
                text-align: center;
                margin: 20px 0 30px 0;
            }}
            .button {{
                display: inline-block;
                background-color: #4f46e5;
                color: #ffffff;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 6px;
                font-weight: 600;
                font-size: 16px;
            }}
            .footer {{
                background-color: #f9fafb;
                padding: 20px;
                text-align: center;
                color: #6b7280;
                font-size: 14px;
                border-top: 1px solid #e5e7eb;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>CleanAI+</h1>
            </div>
            <div class="content">
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>Welcome to the CleanAI+ platform! You can use the verification code below to activate your account and complete the registration process.</p>
                
                <div class="code-container">
                    <div class="code">{code}</div>
                </div>

                <p style="text-align: center;">Or you can simply click the button below to verify your account:</p>
                
                <div class="button-container">
                    <a href="{settings.frontend_url}/verify-email?email={to_email}&code={code}" target="_blank" rel="noopener noreferrer" class="button">Verify My Account</a>
                </div>
                
                <p>This code and link are valid for <strong>3 minutes</strong> (180 seconds). If you did not request this, please ignore this email.</p>
                <p>Thanks,<br>CleanAI+ Team</p>
            </div>
            <div class="footer">
                &copy; 2026 CleanAI+. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    """

    part = MIMEText(html_content, "html")
    msg.attach(part)

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.sender_email, settings.sender_password)
        server.sendmail(settings.sender_email, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
