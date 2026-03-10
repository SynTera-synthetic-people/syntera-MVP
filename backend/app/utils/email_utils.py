from fastapi_mail import FastMail, MessageSchema, ConnectionConfig
from typing import List, Optional
from app.config import settings

conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
)

fm = FastMail(conf)

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
    verify_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"

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
    reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"

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
    invite_link = f"{settings.FRONTEND_URL}/accept-invitation?token={token}"

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


async def send_tier1_welcome_email(email: str, temp_password: Optional[str] = None) -> None:
    """
    Welcome email for Tier-1 (paid) users.

    Highlights the 3-exploration plan and full feature set.
    If temp_password is provided (admin-provisioned), credentials are included.
    """
    login_url = settings.FRONTEND_URL

    credentials_block = (
        f"Login URL: <a href='{login_url}'>{login_url}</a><br>"
        f"Email: {email}<br>"
    )
    if temp_password:
        credentials_block += (
            f"Temporary Password: <b>{temp_password}</b><br><br>"
            "<em>Please change your password after your first login.</em><br><br>"
        )

    body = build_html_email(
        title="Welcome to Synthetic People — Tier 1",
        message=(
            "Your Tier-1 account is now active. Here's what you have access to:<br><br>"
            + credentials_block
            + "&#x2022; 3 research explorations<br>"
            "&#x2022; Manual persona creation<br>"
            "&#x2022; Qual and quant research techniques<br>"
            "&#x2022; Unlimited follow-up conversations<br>"
            "&#x2022; Unlimited quantitative sample size<br>"
            "&#x2022; Downloadable in-depth reports<br>"
            "&#x2022; Full traceability and audit log<br><br>"
            "Start your first exploration and let the insights begin."
        ),
        action_text="Login Now",
        action_link=login_url,
        footer_note="&#x2014; Team Synthetic People | The Behavioural Lab for Customer-Obsessed Teams",
    )

    await send_email("Welcome to Synthetic People — Tier 1", [email], body)


async def send_enterprise_welcome_email(
    email: str,
    full_name: str,
    temp_password: Optional[str] = None,
) -> None:
    """
    Welcome email for enterprise users (enterprise_admin and standard members).

    Always includes login credentials since enterprise accounts are always provisioned
    by an admin — they are never self-signed up.
    """
    login_url = settings.FRONTEND_URL

    credentials_block = (
        f"Login URL: <a href='{login_url}'>{login_url}</a><br>"
        f"Email: {email}<br>"
    )
    if temp_password:
        credentials_block += (
            f"Temporary Password: <b>{temp_password}</b><br><br>"
            "<em>Please change your password after your first login.</em><br><br>"
        )

    body = build_html_email(
        title=f"Welcome to Synthetic People Enterprise, {full_name}",
        message=(
            "Your enterprise account is ready. Here's what's available to your organisation:<br><br>"
            + credentials_block
            + "&#x2022; Up to 10 research explorations (expandable)<br>"
            "&#x2022; Four AI-recommended personas per exploration<br>"
            "&#x2022; Manual persona creation<br>"
            "&#x2022; Qual and quant research techniques<br>"
            "&#x2022; Unlimited follow-up conversations<br>"
            "&#x2022; Unlimited quantitative sample size<br>"
            "&#x2022; Customisable downloadable reports<br>"
            "&#x2022; Full audit log and traceability<br>"
            "&#x2022; First-party data ingestion and integration support<br><br>"
            "Your dedicated account manager will be in touch shortly. "
            "In the meantime, log in and start exploring."
        ),
        action_text="Login Now",
        action_link=login_url,
        footer_note="&#x2014; Team Synthetic People | Enterprise Support",
    )

    await send_email("Welcome to Synthetic People Enterprise", [email], body)


async def send_welcome_email(email: str, temp_password: Optional[str] = None) -> None:
    """
    Send the Synthetic People trial welcome email.

    If temp_password is provided (admin-provisioned user), credentials are included.
    Otherwise (self-signup), only the login URL is shown.
    """
    login_url = settings.FRONTEND_URL

    if temp_password:
        credentials_block = (
            f"Login URL: <a href='{login_url}'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: {temp_password}<br><br>"
            "<em>Please change your password after your first login.</em><br><br>"
        )
    else:
        credentials_block = (
            f"Login URL: <a href='{login_url}'>{login_url}</a><br>"
            f"Email: {email}<br><br>"
        )

    body = build_html_email(
        title="Your Synthetic People Trial Access",
        message=(
            "Welcome to Synthetic People.<br>"
            "Your trial access has been activated. Below are your credentials to get started:<br><br>"
            + credentials_block
            + "During your trial, you'll be able to:<br>"
            "&#x2022; Create one research exploration<br>"
            "&#x2022; Two behaviourally grounded personas<br>"
            "&#x2022; Run qual and quant techniques<br>"
            "&#x2022; Ask unlimited follow-up questions<br>"
            "&#x2022; Download one in-depth insights report with decision intelligence<br><br>"
            "A small suggestion: start with a real decision you're currently evaluating. "
            "The sharper the context, the more meaningful the output.<br><br>"
            "If you have any questions, just reply to this email. Our team reads every message."
        ),
        action_text="Login Now",
        action_link=login_url,
        footer_note="&#x2014; Team Synthetic People | The Behavioural Lab for Customer-Obsessed Teams",
    )

    await send_email("Your Synthetic People Trial Access", [email], body)


async def send_enterprise_inquiry_email(user_email: str, user_name: str) -> None:
    """
    Notify the internal team when a user clicks 'Enterprise Pack'.
    Sent to humans@synthetic-people.ai for manual follow-up.
    """
    body = build_html_email(
        title="New Enterprise Plan Inquiry",
        message=(
            f"A user has expressed interest in the Enterprise Pack.<br><br>"
            f"<strong>Name:</strong> {user_name}<br>"
            f"<strong>Email:</strong> {user_email}<br><br>"
            "Please follow up with them at your earliest convenience."
        ),
        action_text="Reply to User",
        action_link=f"mailto:{user_email}",
        footer_note="&#x2014; Synthetic People Internal Notification",
    )
    await send_email("Enterprise Plan Inquiry", ["humans@synthetic-people.ai"], body)
