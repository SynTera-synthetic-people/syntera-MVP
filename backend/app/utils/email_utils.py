from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from typing import List
import os
from dotenv import load_dotenv

load_dotenv()

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD"),
    MAIL_FROM=os.getenv("MAIL_FROM"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER=os.getenv("MAIL_SERVER"),
    MAIL_STARTTLS=os.getenv("MAIL_STARTTLS", "True") == "True",
    MAIL_SSL_TLS=os.getenv("MAIL_SSL_TLS", "False") == "True",
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)

fm = FastMail(conf)

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://dev-ui.synthetic-people.ai")

def build_html_email(title: str, message: str, action_text: str, action_link: str, footer_note: str):
    """
    Builds a simple but elegant HTML email template.
    """
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f9fafb; padding: 40px;">
      <table width="100%" cellspacing="0" cellpadding="0"
             style="max-width: 600px; margin: auto; background: #ffffff;
                    border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        <tr>
          <td style="text-align: center; padding: 30px;">
            <h2 style="color: #2b2d42;">Synthetic People</h2>
            <p style="color: #555; font-size: 16px;">{title}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 20px 40px;">
            <p style="font-size: 15px; color: #333; line-height: 1.5;">{message}</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="{action_link}" style="background-color: #007bff; color: #fff;
                 padding: 12px 25px; text-decoration: none; border-radius: 5px;
                 font-weight: bold;">{action_text}</a>
            </div>
            <p style="font-size: 13px; color: #666;">{footer_note}</p>
          </td>
        </tr>
        <tr>
          <td style="text-align: center; padding: 15px; background-color: #f1f3f5;
                     font-size: 12px; color: #888;">
            © 2025 Synthetic People. All rights reserved.
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

async def send_email(subject: str, recipients: List[str], body: str):
    """
    Sends an HTML email using FastMail.
    """
    message = MessageSchema(
        subject=subject,
        recipients=recipients,
        body=body,
        subtype="html",
    )
    await fm.send_message(message)


async def send_verification_email(email: str, token: str):
    verify_link = f"{FRONTEND_URL}/verify-email?token={token}"

    body = build_html_email(
        title="Verify Your Email Address",
        message=(
            "Thank you for signing up with <b>Synthetic People</b>!<br>"
            "Please verify your email address by clicking the button below."
        ),
        action_text="Verify Email",
        action_link=verify_link,
        footer_note="This verification link will expire in 24 hours.",
    )

    await send_email("Verify your Synthetic People account", [email], body)

async def send_reset_password_email(email: str, token: str):
    reset_link = f"{FRONTEND_URL}/reset-password?token={token}"

    body = build_html_email(
        title="Reset Your Password",
        message=(
            "We received a request to reset your password.<br>"
            "Click below to create a new password."
        ),
        action_text="Reset Password",
        action_link=reset_link,
        footer_note="If you did not request a password reset, please ignore this email.",
    )

    await send_email("Reset your Synthetic People password", [email], body)

async def send_invite_email(email: str, token: str):
    invite_link = f"{FRONTEND_URL}/accept-invitation?token={token}"

    body = build_html_email(
        title="You've Been Invited to Join a Workspace",
        message=(
            "You've been invited to join a workspace on <b>Synthetic People</b>.<br>"
            "Click below to accept and start collaborating!"
        ),
        action_text="Accept Invitation",
        action_link=invite_link,
        footer_note="This invitation will expire in 7 days.",
    )

    await send_email("You're invited to join Synthetic People", [email], body)
