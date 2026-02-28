import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from email.mime.image import MIMEImage
import os
import base64
from app.config import settings

# Base64 encoded 32x32 white lightning bolt PNG logo with indigo background
LOGO_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAwUlEQVR4nMWXYQrCMAxG1xxAD6nMMyn1kHqBjQgOKZtN0i/J+7U/4720pdAyNVzm1zI583ycy/ebouWth6LlrY8Q8no/mSMoS757BqLlzFAAAsqc3hyAkpsCkHJ1AFquDvCAMqcXB3jJmdK7CZHy6+2tW4HqLO8GeMv/BnjuezegBiy9+BAeIYnsyRm3MyCRuwVI5W4BGihzeniAVg4NsMhhAVY5LGAEypz+E/D7UIyWM5s8+m3I8PDbFoyshFXO/609lUzWu8rXswAAAABJRU5ErkJggg=="

def send_verification_email(to_email: str, code: str, full_name: str):
    msg = MIMEMultipart("related")
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
                border: 1px solid #e5e7eb;
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
                color: #ffffff;
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
                color: #ffffff !important;
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
    <body style="background-color: #f4f7f6; margin: 0; padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
            <tr>
                <td align="center" style="padding: 40px 10px;">
                    <div class="container" style="text-align: left; margin: 0 auto;">
                        <div class="header">
                            <h1 style="color: #ffffff;">Verify Your Account</h1>
                        </div>
            <div class="content">
                <div style="text-align: right; margin-bottom: 15px;">
                    <img src="cid:logo" alt="CleanAI+ Logo" width="20" height="20" style="vertical-align: middle; margin-right: 4px;" />
                    <span style="vertical-align: middle; font-size: 14px; font-weight: bold; color: #4f46e5;">CleanAI+</span>
                </div>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>Welcome to the CleanAI+ platform! You can use the verification code below to activate your account and complete the registration process.</p>
                
                <div class="code-container">
                    <div class="code">{code}</div>
                </div>

                <p style="text-align: center;">Or you can simply click the button below to verify your account:</p>
                
                <div class="button-container">
                    <a href="{settings.frontend_url}/verify-email?email={to_email}&code={code}" target="_blank" rel="noopener noreferrer" class="button" style="color: #ffffff;">Verify My Account</a>
                </div>
                
                <p>This code and link are valid for <strong>3 minutes</strong> (180 seconds). If you did not request this, please ignore this email.</p>
                <p>Thanks,<br>CleanAI+ Team</p>
            </div>
            <div class="footer">
                &copy; 2026 CleanAI+. All rights reserved.
            </div>
        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    part = MIMEText(html_content, "html")
    msg.attach(part)

    # Attach inline logo
    try:
        img_data = base64.b64decode(LOGO_BASE64)
        img = MIMEImage(img_data)
        img.add_header('Content-ID', '<logo>')
        img.add_header('Content-Disposition', 'inline', filename='logo.png')
        msg.attach(img)
    except Exception as e:
        print(f"Failed to attach logo: {e}")

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.sender_email, settings.sender_password)
        server.sendmail(settings.sender_email, to_email, msg.as_string())
        server.quit()
        return True, html_content
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False, html_content

def send_welcome_email(to_email: str, full_name: str):
    msg = MIMEMultipart("related")
    msg["Subject"] = "Welcome to CleanAI+!"
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
                border: 1px solid #e5e7eb;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }}
            .header {{
                background-color: #10b981;
                color: #ffffff;
                padding: 30px 20px;
                text-align: center;
            }}
            .header h1 {{
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                color: #ffffff;
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
            .button-container {{
                text-align: center;
                margin: 30px 0;
            }}
            .button {{
                display: inline-block;
                background-color: #10b981;
                color: #ffffff !important;
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
    <body style="background-color: #f4f7f6; margin: 0; padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
            <tr>
                <td align="center" style="padding: 40px 10px;">
                    <div class="container" style="text-align: left; margin: 0 auto;">
                        <div class="header">
                            <h1 style="color: #ffffff;">Welcome to CleanAI+</h1>
                        </div>
            <div class="content">
                <div style="text-align: right; margin-bottom: 15px;">
                    <img src="cid:logo" alt="CleanAI+ Logo" width="20" height="20" style="vertical-align: middle; margin-right: 4px;" />
                    <span style="vertical-align: middle; font-size: 14px; font-weight: bold; color: #4f46e5;">CleanAI+</span>
                </div>
                <p>Hello <strong>{full_name}</strong>,</p>
                <p>Your account has been successfully verified! We are thrilled to have you on board.</p>
                <p>CleanAI+ is designed to help you build, train, and evaluate your AI models efficiently while keeping track of your carbon footprint and energy consumption.</p>
                
                <div class="button-container">
                    <a href="{settings.frontend_url}/login" target="_blank" rel="noopener noreferrer" class="button" style="color: #ffffff;">Go to Dashboard</a>
                </div>
                
                <p>If you have any questions or need assistance, feel free to reach out to our support team.</p>
                <p>Thanks,<br>CleanAI+ Team</p>
            </div>
            <div class="footer">
                &copy; 2026 CleanAI+. All rights reserved.
            </div>
        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    part = MIMEText(html_content, "html")
    msg.attach(part)

    # Attach inline logo
    try:
        img_data = base64.b64decode(LOGO_BASE64)
        img = MIMEImage(img_data)
        img.add_header('Content-ID', '<logo>')
        img.add_header('Content-Disposition', 'inline', filename='logo.png')
        msg.attach(img)
    except Exception as e:
        print(f"Failed to attach logo: {e}")

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.sender_email, settings.sender_password)
        server.sendmail(settings.sender_email, to_email, msg.as_string())
        server.quit()
        return True, html_content
    except Exception as e:
        print(f"Failed to send welcome email: {e}")
        return False, html_content

def send_execution_result_email(to_email: str, full_name: str, execution_id: str, workspace_id: str = None, status: str = "completed", metrics: dict = None, error_message: str = None, pdf_path: str = None):
    msg = MIMEMultipart("related")
    
    if status == "completed":
        msg["Subject"] = f"CleanAI+ - Execution Completed Successfully ({execution_id[:8]})"
    else:
        msg["Subject"] = f"CleanAI+ - Execution Failed ({execution_id[:8]})"
        
    msg["From"] = f"CleanAI+ <{settings.sender_email}>"
    msg["To"] = to_email

    # Base CSS
    css = """
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden; }
        .header { padding: 30px 20px; text-align: center; color: #ffffff; }
        .header.success { background-color: #10b981; }
        .header.error { background-color: #ef4444; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; color: #ffffff; }
        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
        .metrics-grid { text-align: center; margin: 20px 0; font-size: 0; }
        .metric-card { display: inline-block; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; width: 45%; margin: 10px 2%; box-sizing: border-box; text-align: center; vertical-align: top; font-size: 14px; }
        .metric-value { font-size: 20px; font-weight: bold; color: #2563eb; margin-top: 5px; }
        .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .error-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin-top: 20px; color: #991b1b; }
        .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 20px; }
    """

    if status == "completed" and metrics:
        content_html = f"""
            <p>Hello <strong>{full_name}</strong>,</p>
            <p>Your model execution (ID: {execution_id}) has completed successfully. Here are the results:</p>
            
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Accuracy</div>
                    <div class="metric-value">{metrics.get('accuracy', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">F1 Score</div>
                    <div class="metric-value">{metrics.get('f1_score', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Precision</div>
                    <div class="metric-value">{metrics.get('precision', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Recall</div>
                    <div class="metric-value">{metrics.get('recall', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Loss</div>
                    <div class="metric-value">{metrics.get('loss', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Top-5 Accuracy</div>
                    <div class="metric-value">{metrics.get('top5_accuracy', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Processed Samples</div>
                    <div class="metric-value">{metrics.get('processed_samples', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Dataset Size</div>
                    <div class="metric-value">{metrics.get('dataset_size', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Time (s)</div>
                    <div class="metric-value">{metrics.get('total_time_s', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Time / Sample (ms)</div>
                    <div class="metric-value">{metrics.get('time_per_sample_ms', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Total Energy (J)</div>
                    <div class="metric-value">{metrics.get('total_energy_j', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Energy / Sample (J)</div>
                    <div class="metric-value">{metrics.get('energy_per_sample_j', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">GFLOPs / Sample</div>
                    <div class="metric-value">{metrics.get('gflops_per_sample', 'N/A')}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">GFLOPs / Joule</div>
                    <div class="metric-value">{metrics.get('gflops_per_joule', 'N/A')}</div>
                </div>
            </div>
            
            <p>A detailed PDF report is attached to this email.</p>
            <div style="text-align: center;">
                <a href="{settings.frontend_url}/workspaces/{workspace_id}?tab=executions&execution={execution_id}" class="button" style="color: #ffffff;">View Execution Details</a>
            </div>
        """
        header_class = "success"
        header_text = "Execution Completed"
    else:
        content_html = f"""
            <p>Hello <strong>{full_name}</strong>,</p>
            <p>Unfortunately, your model execution (ID: {execution_id}) has failed.</p>
            
            <div class="error-box">
                <strong>Error Details:</strong><br>
                {error_message or "An unknown error occurred during execution."}
            </div>
            
            <p>Please check your model configuration, dataset, and preprocessing steps, then try again.</p>
            <div style="text-align: center;">
                <a href="{settings.frontend_url}/workspaces/{workspace_id}?tab=executions&execution={execution_id}" class="button" style="color: #ffffff;">Go to Workspace</a>
            </div>
        """
        header_class = "error"
        header_text = "Execution Failed"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><style>{css}</style></head>
    <body style="background-color: #f4f7f6; margin: 0; padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
            <tr>
                <td align="center" style="padding: 40px 10px;">
                    <div class="container" style="text-align: left; margin: 0 auto;">
                        <div class="header {header_class}">
                            <h1 style="color: #ffffff;">{header_text}</h1>
                        </div>
            <div class="content">
                <div style="text-align: right; margin-bottom: 15px;">
                    <img src="cid:logo" alt="CleanAI+ Logo" width="20" height="20" style="vertical-align: middle; margin-right: 4px;" />
                    <span style="vertical-align: middle; font-size: 14px; font-weight: bold; color: #4f46e5;">CleanAI+</span>
                </div>
                {content_html}
                <p style="margin-top: 30px;">Thanks,<br>CleanAI+ Team</p>
            </div>
            <div class="footer">
                &copy; 2026 CleanAI+. All rights reserved.
            </div>
        </div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    part = MIMEText(html_content, "html")
    msg.attach(part)

    # Attach inline logo
    try:
        img_data = base64.b64decode(LOGO_BASE64)
        img = MIMEImage(img_data)
        img.add_header('Content-ID', '<logo>')
        img.add_header('Content-Disposition', 'inline', filename='logo.png')
        msg.attach(img)
    except Exception as e:
        print(f"Failed to attach logo: {e}")

    # Attach PDF if provided and exists
    attachment_base64 = None
    if pdf_path and os.path.exists(pdf_path):
        try:
            with open(pdf_path, "rb") as f:
                pdf_data = f.read()
                pdf_attachment = MIMEApplication(pdf_data, _subtype="pdf")
                pdf_attachment.add_header('Content-Disposition', 'attachment', filename=os.path.basename(pdf_path))
                msg.attach(pdf_attachment)
                attachment_base64 = base64.b64encode(pdf_data).decode('utf-8')
        except Exception as e:
            print(f"Failed to attach PDF: {e}")

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.sender_email, settings.sender_password)
        server.sendmail(settings.sender_email, to_email, msg.as_string())
        server.quit()
        return True, html_content, attachment_base64
    except Exception as e:
        print(f"Failed to send execution result email: {e}")
        return False, html_content, attachment_base64


def send_optimization_result_email(
    to_email: str,
    full_name: str,
    optimization_id: str,
    workspace_id: str = None,
    status: str = "completed",
    result: dict = None,
    config: dict = None,
    error_message: str = None,
):
    msg = MIMEMultipart("related")

    if status == "completed":
        msg["Subject"] = f"CleanAI+ - Optimization Completed ({optimization_id[:8]})"
    else:
        msg["Subject"] = f"CleanAI+ - Optimization Failed ({optimization_id[:8]})"

    msg["From"] = f"CleanAI+ <{settings.sender_email}>"
    msg["To"] = to_email

    css = """
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f6; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { padding: 30px 20px; text-align: center; color: #ffffff; }
        .header.success { background-color: #10b981; }
        .header.error { background-color: #ef4444; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 600; color: #ffffff; }
        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
        .metrics-grid { text-align: center; margin: 20px 0; font-size: 0; }
        .metric-card { display: inline-block; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; width: 45%; margin: 10px 2%; box-sizing: border-box; text-align: center; vertical-align: top; font-size: 14px; }
        .metric-value { font-size: 20px; font-weight: bold; color: #10b981; margin-top: 5px; }
        .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; }
        .config-box { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin: 20px 0; font-size: 14px; }
        .config-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f3f4f6; }
        .config-row:last-child { border-bottom: none; }
        .error-box { background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; margin-top: 20px; color: #991b1b; }
        .footer { background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 14px; border-top: 1px solid #e5e7eb; }
        .button { display: inline-block; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600; margin-top: 20px; }
        .badge-success { display: inline-block; background-color: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; border-radius: 4px; padding: 2px 8px; font-size: 13px; font-weight: 600; }
    """

    if status == "completed" and result:
        pruning_ratio = (config or {}).get("pruning_ratio", "N/A")
        importance = (config or {}).get("importance_type", "N/A")
        original_params = result.get("original_params", 0)
        pruned_params = result.get("pruned_params", 0)
        param_pct = result.get("param_reduction_pct", 0)
        original_macs = result.get("original_macs", 0)
        pruned_macs = result.get("pruned_macs", 0)
        mac_pct = result.get("mac_reduction_pct", 0)
        orig_mb = round(result.get("original_size_bytes", 0) / (1024 * 1024), 2)
        pruned_mb = round(result.get("pruned_size_bytes", 0) / (1024 * 1024), 2)
        output_name = result.get("output_model_name", "—")

        content_html = f"""
            <p>Hello <strong>{full_name}</strong>,</p>
            <p>Your network optimization (ID: <code>{optimization_id}</code>) has completed successfully.</p>
            <p>Optimized model saved as: <span class="badge-success">{output_name}</span></p>

            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-label">Parameters (original)</div>
                    <div class="metric-value" style="color:#6b7280;">{int(original_params):,}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Parameters (pruned)</div>
                    <div class="metric-value">{int(pruned_params):,}</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">Param Reduction</div>
                    <div class="metric-value">{param_pct}%</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">MACs Reduction</div>
                    <div class="metric-value">{mac_pct}%</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">File Size (original)</div>
                    <div class="metric-value" style="color:#6b7280;">{orig_mb} MB</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">File Size (pruned)</div>
                    <div class="metric-value">{pruned_mb} MB</div>
                </div>
            </div>

            <div class="config-box">
                <strong style="font-size:13px;color:#374151;">Pruning Config</strong>
                <div class="config-row"><span style="color:#6b7280;">Pruning Ratio</span><span>{pruning_ratio}</span></div>
                <div class="config-row"><span style="color:#6b7280;">Importance Criterion</span><span>{importance}</span></div>
            </div>

            <div style="text-align: center;">
                <a href="{settings.frontend_url}/workspaces/{workspace_id}?tab=optimization" class="button" style="color: #ffffff;">View Optimization Details</a>
            </div>
        """
        header_class = "success"
        header_text = "Optimization Completed"
    else:
        content_html = f"""
            <p>Hello <strong>{full_name}</strong>,</p>
            <p>Unfortunately, your network optimization (ID: <code>{optimization_id}</code>) has failed.</p>

            <div class="error-box">
                <strong>Error Details:</strong><br>
                {error_message or "An unknown error occurred during optimization."}
            </div>

            <p>Please check your model format, definition file (if needed), and configuration, then try again.</p>
            <div style="text-align: center;">
                <a href="{settings.frontend_url}/workspaces/{workspace_id}?tab=optimization" class="button" style="color: #ffffff;">Go to Workspace</a>
            </div>
        """
        header_class = "error"
        header_text = "Optimization Failed"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><style>{css}</style></head>
    <body style="background-color: #f4f7f6; margin: 0; padding: 0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f4f7f6;">
            <tr>
                <td align="center" style="padding: 40px 10px;">
                    <div class="container" style="text-align: left; margin: 0 auto;">
                        <div class="header {header_class}">
                            <h1 style="color: #ffffff;">{header_text}</h1>
                        </div>
                        <div class="content">
                            <div style="text-align: right; margin-bottom: 15px;">
                                <img src="cid:logo" alt="CleanAI+ Logo" width="20" height="20" style="vertical-align: middle; margin-right: 4px;" />
                                <span style="vertical-align: middle; font-size: 14px; font-weight: bold; color: #4f46e5;">CleanAI+</span>
                            </div>
                            {content_html}
                            <p style="margin-top: 30px;">Thanks,<br>CleanAI+ Team</p>
                        </div>
                        <div class="footer">&copy; 2026 CleanAI+. All rights reserved.</div>
                    </div>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    part = MIMEText(html_content, "html")
    msg.attach(part)

    try:
        img_data = base64.b64decode(LOGO_BASE64)
        img = MIMEImage(img_data)
        img.add_header('Content-ID', '<logo>')
        img.add_header('Content-Disposition', 'inline', filename='logo.png')
        msg.attach(img)
    except Exception as e:
        print(f"Failed to attach logo: {e}")

    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.sender_email, settings.sender_password)
        server.sendmail(settings.sender_email, to_email, msg.as_string())
        server.quit()
        return True, html_content
    except Exception as e:
        print(f"Failed to send optimization result email: {e}")
        return False, html_content
