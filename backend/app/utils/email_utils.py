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


def build_html_email(title: str, message: str, action_text: str, action_link: str, footer_note: str) -> str:
    """Simple HTML template for transactional emails (verify, reset, share, inquiry)."""
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
            &copy; 2026 Synthetic People. All rights reserved.
          </td>
        </tr>
      </table>
    </body>
    </html>
    """


def _build_onboarding_email(
    greeting: str,
    intro_paragraphs: List[str],
    feature_items: List[str],
    example_intro: str,
    example_items: List[str],
    closing_paragraphs: List[str],
    cta_text: str,
    cta_link: str,
    ps_note: str,
    credentials_html: str = "",
) -> str:
    """Rich branded HTML template for account-type-specific onboarding emails."""
    intro_html = "".join(
        f'<p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 14px 0;">{p}</p>'
        for p in intro_paragraphs
    )
    features_html = "".join(
        f'<li style="font-size:15px;color:#333;line-height:1.8;padding:2px 0;">{item}</li>'
        for item in feature_items
    )
    examples_html = "".join(
        f'<li style="font-size:15px;color:#555;line-height:1.8;padding:2px 0;">{ex}</li>'
        for ex in example_items
    )
    closing_html = "".join(
        f'<p style="font-size:15px;color:#333;line-height:1.7;margin:14px 0 0 0;">{p}</p>'
        for p in closing_paragraphs
    )

    credentials_section = ""
    if credentials_html:
        credentials_section = f"""
        <div style="background:#f0f4ff;border-left:4px solid #2b2d42;padding:16px 20px;
                    margin:20px 0;border-radius:0 6px 6px 0;">
          <p style="margin:0;font-size:14px;color:#333;line-height:1.9;">{credentials_html}</p>
        </div>
        """

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:'Helvetica Neue',Arial,sans-serif;background-color:#f4f5f7;
             padding:40px 20px;margin:0;">
  <table width="100%" cellspacing="0" cellpadding="0"
         style="max-width:620px;margin:auto;background:#ffffff;border-radius:10px;
                box-shadow:0 2px 16px rgba(0,0,0,0.08);">
    <tr>
      <td style="background:#2b2d42;border-radius:10px 10px 0 0;padding:28px 40px;">
        <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
          Synthetic&#8209;People
        </h1>
        <p style="color:#9ca3b8;margin:5px 0 0;font-size:13px;">
          Your always&#8209;on consumer understanding lab
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:36px 40px 28px;">
        <p style="font-size:17px;color:#2b2d42;font-weight:600;margin:0 0 22px 0;">{greeting}</p>
        {intro_html}
        {credentials_section}
        <ul style="padding-left:22px;margin:16px 0 24px 0;">
          {features_html}
        </ul>
        <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 10px 0;">
          <strong>{example_intro}</strong>
        </p>
        <ul style="padding-left:22px;margin:0 0 24px 0;list-style-type:disc;">
          {examples_html}
        </ul>
        {closing_html}
        <div style="text-align:center;margin:32px 0 24px;">
          <a href="{cta_link}"
             style="display:inline-block;background-color:#2b2d42;color:#ffffff;
                    padding:14px 38px;text-decoration:none;border-radius:6px;
                    font-weight:700;font-size:15px;letter-spacing:0.3px;">
            {cta_text}
          </a>
        </div>
        <p style="font-size:14px;color:#555;line-height:1.7;margin:20px 0 0;">
          See you inside,<br>
          <strong>Team Synthetic&#8209;People</strong>
        </p>
        <p style="font-size:13px;color:#888;font-style:italic;margin:14px 0 0;">{ps_note}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8f9fa;border-radius:0 0 10px 10px;padding:16px 40px;
                 text-align:center;border-top:1px solid #e9ecef;">
        <p style="font-size:12px;color:#aaa;margin:0;">
          &copy; 2026 Synthetic People. All rights reserved.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_email(subject: str, recipients: List[str], body: str) -> None:
    message = MessageSchema(
        subject=subject,
        recipients=recipients,
        body=body,
        subtype="html",
    )
    await fm.send_message(message)


async def send_verification_email(email: str, token: str) -> None:
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


async def send_reset_password_email(email: str, token: str) -> None:
    reset_link = f"{settings.FRONTEND_URL}/reset-password/{token}"
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


async def send_welcome_email(
    email: str,
    temp_password: Optional[str] = None,
    first_name: Optional[str] = None,
) -> None:
    """Free Trial welcome email."""
    login_url = settings.FRONTEND_URL
    name = first_name or "there"

    credentials_html = ""
    if temp_password:
        credentials_html = (
            f"Login URL: <a href='{login_url}' style='color:#2b2d42;font-weight:600;'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: <strong>{temp_password}</strong><br>"
            "<em style='color:#666;'>Please change your password after your first login.</em>"
        )

    body = _build_onboarding_email(
        greeting=f"Hi {name},",
        intro_paragraphs=[
            "Welcome to Synthetic-People.",
            "Your Free Trial Pack is now live, giving you a simple way to test a real consumer "
            "question and see how quickly better insight can shape the next step.",
            "You have one research exploration ready to use.",
            "Start with a question your team is already thinking about &#8212; a product idea, "
            "a message, a customer segment, a pricing hunch, or a decision that needs more "
            "clarity before it moves ahead.",
            "Here&#8217;s what&#8217;s included:",
        ],
        feature_items=[
            "One research exploration",
            "Two recommended personas",
            "Qualitative and quantitative study",
            "Unlimited follow-up conversations",
            "Downloadable in-depth report",
        ],
        example_intro=(
            "A good way to begin?<br>"
            "Pick the question that keeps coming back in meetings.<br>"
            "For example:"
        ),
        example_items=[
            "Which message should we lead with?",
            "Why might customers hesitate?",
            "What would make people switch?",
            "Which segment should we focus on first?",
            "What could quietly fail after launch?",
            "What are we not seeing yet?",
        ],
        closing_paragraphs=[
            "Bring one hunch.<br>Run one exploration.<br>See what your consumers reveal.",
            "Click below to begin.",
        ],
        cta_text="Start Exploring",
        cta_link=login_url,
        ps_note="P.S. Start with the question your team keeps circling back to. Omi is very good with unresolved debates.",
        credentials_html=credentials_html,
    )

    await send_email(
        "Welcome to Synthetic-People. Your first exploration is ready.",
        [email],
        body,
    )


async def send_tier1_welcome_email(
    email: str,
    temp_password: Optional[str] = None,
    first_name: Optional[str] = None,
) -> None:
    """Explorer Pack (Tier-1) welcome email."""
    login_url = settings.FRONTEND_URL
    name = first_name or "there"

    credentials_html = ""
    if temp_password:
        credentials_html = (
            f"Login URL: <a href='{login_url}' style='color:#2b2d42;font-weight:600;'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: <strong>{temp_password}</strong><br>"
            "<em style='color:#666;'>Please change your password after your first login.</em>"
        )

    body = _build_onboarding_email(
        greeting=f"Hi {name},",
        intro_paragraphs=[
            "Welcome to Synthetic-People.",
            "Your Explorer Pack is now live &#8212; which means you&#8217;re all set to start "
            "testing ideas, exploring consumer questions, and turning &#8220;we think&#8221; "
            "into &#8220;we understand.&#8221;",
            "The Explorer Pack is built for startups, SMEs, and small teams that want sharper "
            "consumer understanding without waiting weeks for traditional research.",
            "Here&#8217;s what you can do inside:",
        ],
        feature_items=[
            "Run three research explorations",
            "Start with two recommended personas",
            "Run both qualitative and quantitative studies",
            "Ask unlimited follow-up questions",
            "Use unlimited sample size in quant",
            "Download an in-depth insight report",
            "Access a traceability log to see the evidence behind the insight",
        ],
        example_intro=(
            "Bring that question into Synthetic-People and let the platform help you "
            "pressure-test it before the market does.<br><br>"
            "Not sure where to begin?<br>Start with a question your team is already debating:"
        ),
        example_items=[
            "Which message should we lead with?",
            "Why might customers hesitate?",
            "What would make people switch?",
            "Which segment should we prioritise first?",
            "What could quietly fail after launch?",
            "What are we not seeing yet?",
        ],
        closing_paragraphs=[
            "Click below to begin your first exploration.",
        ],
        cta_text="Start Exploring",
        cta_link=login_url,
        ps_note="P.S. Start with the question your team keeps circling back to. Omi is very good with unresolved debates.",
        credentials_html=credentials_html,
    )

    await send_email(
        "Welcome to Synthetic-People. Your Explorer Pack is live.",
        [email],
        body,
    )


async def send_enterprise_welcome_email(
    email: str,
    full_name: str,
    temp_password: Optional[str] = None,
) -> None:
    """Enterprise Admin welcome email."""
    login_url = settings.FRONTEND_URL

    credentials_html = ""
    if temp_password:
        credentials_html = (
            f"Login URL: <a href='{login_url}' style='color:#2b2d42;font-weight:600;'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: <strong>{temp_password}</strong><br>"
            "<em style='color:#666;'>Please change your password after your first login.</em>"
        )

    body = _build_onboarding_email(
        greeting="Welcome aboard. &#x1F680;",
        intro_paragraphs=[
            "Your Synthetic-People enterprise account is now live.",
            "You now have access to a new way of understanding consumers &#8212; one that "
            "doesn&#8217;t depend on waiting weeks for surveys, chasing respondents, coordinating "
            "fieldwork, or making high-stakes decisions with half-visible behaviour.",
            "Think of Synthetic-People as your always-on consumer understanding lab.",
            "A place where your teams can test ideas, pressure-test assumptions, explore customer "
            "segments, understand barriers, decode motivations, and ask the messy &#8220;why&#8221; "
            "behind consumer decisions &#8212; whenever curiosity strikes.",
            "As the enterprise admin, you can now:",
        ],
        feature_items=[
            "Create and manage workspaces across teams, departments, or business priorities",
            "Invite team members and assign them to relevant workspaces",
            "Create unlimited research explorations within each workspace",
            "Build consumer personas manually or let Omi generate them for you",
            "Run qualitative and quantitative explorations",
            "Have unlimited conversations with consumer personas to probe reactions, motivations, "
            "trade-offs, and decision-making",
            "Generate Decision Intelligence and Behaviour Archaeology reports with transcripts, "
            "data shells, and supporting evidence",
            "Use the Decision Room to challenge assumptions, explore scenarios, identify "
            "opportunities, and convert insights into action",
        ],
        example_intro=(
            "Simply put: whenever your team has a question about consumers, "
            "Synthetic-People is ready to explore it.<br><br>"
            "Not sure where to begin?<br>"
            "Start with a question already floating around in your meetings:"
        ),
        example_items=[
            "Why aren&#8217;t customers adopting this feature?",
            "Which message will actually land?",
            "What would make consumers switch?",
            "Where are we losing trust?",
            "Which segment are we underestimating?",
            "What opportunity are we overlooking?",
        ],
        closing_paragraphs=[
            "Bring the curiosity.",
            "We&#8217;ll help uncover the behaviours, tensions, motivations, and decisions "
            "hiding beneath the surface.",
            "We&#8217;re excited to have you with us.",
        ],
        cta_text="Enter Your Lab",
        cta_link=login_url,
        ps_note="P.S. Omi is already waiting for your first question. And yes, it has thoughts. &#x1F440;",
        credentials_html=credentials_html,
    )

    await send_email(
        "Welcome to Synthetic-People. Your consumer lab is live.",
        [email],
        body,
    )


async def send_enterprise_member_welcome_email(
    email: str,
    first_name: str,
    temp_password: Optional[str] = None,
    org_name: Optional[str] = None,
) -> None:
    """Enterprise standard member welcome email."""
    login_url = settings.FRONTEND_URL
    workspace_display = org_name or "your team&#8217;s workspace"
    first_name = first_name.split()[0] if first_name else "there"

    credentials_html = ""
    if temp_password:
        credentials_html = (
            f"Login URL: <a href='{login_url}' style='color:#2b2d42;font-weight:600;'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: <strong>{temp_password}</strong><br>"
            "<em style='color:#666;'>Please change your password after your first login.</em>"
        )

    body = _build_onboarding_email(
        greeting=f"Hi {first_name},",
        intro_paragraphs=[
            f"You&#8217;ve been invited to join <strong>{workspace_display}</strong> on Synthetic-People.",
            "This is your team&#8217;s space to explore consumer questions, test ideas, build "
            "personas, run research explorations, and turn curiosity into clear next steps.",
            "Think of it as your always-on consumer lab &#8212; ready whenever your team has a "
            "question, hunch, debate, or &#8220;wait, what if?&#8221; moment.",
            "Inside your workspace, you&#8217;ll be able to:",
        ],
        feature_items=[
            "Create consumer personas built for your team&#8217;s research questions",
            "Ask follow-up questions and run unlimited what-ifs",
            "Run qualitative and quantitative explorations",
            "Spot patterns, barriers, opportunities, and decision drivers",
            "Use Decision Room to challenge assumptions and shape next steps",
        ],
        example_intro="Not sure where to begin? Start with a question your team is already debating:",
        example_items=[
            "What would make customers switch?",
            "Why is adoption lower than expected?",
            "Which message will land best?",
            "Where are customers dropping off?",
            "What are we missing?",
            "Which idea should we test first?",
        ],
        closing_paragraphs=[
            "Click below to join the workspace and start exploring.",
        ],
        cta_text="Join Workspace",
        cta_link=login_url,
        ps_note="P.S. Omi is ready when you are. Start with a hunch. It loves those.",
        credentials_html=credentials_html,
    )

    subject_workspace = org_name or "Synthetic-People"
    await send_email(
        f"You've been invited to {subject_workspace} on Synthetic-People",
        [email],
        body,
    )


async def send_invite_email(
    email: str,
    token: str,
    workspace_name: str,
    temp_password: Optional[str] = None,
    first_name: Optional[str] = None,
) -> None:
    """Workspace invite email (enterprise std user or standard workspace invite)."""
    invite_link = f"{settings.FRONTEND_URL}/accept-invitation?token={token}"
    login_url = settings.FRONTEND_URL
    name = first_name or "there"

    credentials_html = ""
    if temp_password:
        credentials_html = (
            f"Login URL: <a href='{login_url}' style='color:#2b2d42;font-weight:600;'>{login_url}</a><br>"
            f"Email: {email}<br>"
            f"Temporary Password: <strong>{temp_password}</strong><br>"
            "<em style='color:#666;'>Please change your password after your first login.</em>"
        )

    body = _build_onboarding_email(
        greeting=f"Hi {name},",
        intro_paragraphs=[
            f"You&#8217;ve been invited to join <strong>{workspace_name}</strong> on Synthetic-People.",
            "This is your team&#8217;s space to explore consumer questions, test ideas, build "
            "personas, run research explorations, and turn curiosity into clear next steps.",
            "Think of it as your always-on consumer lab &#8212; ready whenever your team has a "
            "question, hunch, debate, or &#8220;wait, what if?&#8221; moment.",
            "Inside your workspace, you&#8217;ll be able to:",
        ],
        feature_items=[
            "Create consumer personas built for your team&#8217;s research questions",
            "Ask follow-up questions and run unlimited what-ifs",
            "Run qualitative and quantitative explorations",
            "Spot patterns, barriers, opportunities, and decision drivers",
            "Use Decision Room to challenge assumptions and shape next steps",
        ],
        example_intro="Not sure where to begin? Start with a question your team is already debating:",
        example_items=[
            "What would make customers switch?",
            "Why is adoption lower than expected?",
            "Which message will land best?",
            "Where are customers dropping off?",
            "What are we missing?",
            "Which idea should we test first?",
        ],
        closing_paragraphs=[
            "Click below to join the workspace and start exploring.",
        ],
        cta_text="Join Workspace",
        cta_link=invite_link,
        ps_note="P.S. Omi is ready when you are. Start with a hunch. It loves those.",
        credentials_html=credentials_html,
    )

    await send_email(
        f"You've been invited to {workspace_name} on Synthetic-People",
        [email],
        body,
    )


async def send_share_report_email(
    recipient_email: str,
    report_type: str,
    file_path: str,
    shared_by_email: str,
) -> None:
    """Send a shared insight report as an email attachment."""
    import os
    login_url = settings.FRONTEND_URL
    body = build_html_email(
        title=f"Shared Insights: {report_type}",
        message=(
            f"<b>{shared_by_email}</b> has shared a <b>{report_type}</b> insight report "
            f"from Synthetic People with you.<br><br>"
            "Please find the report attached to this email.<br><br>"
            "If you&#8217;re not already on Synthetic People, click below to learn more."
        ),
        action_text="Visit Synthetic People",
        action_link=login_url,
        footer_note="You're receiving this because someone shared an insight report with you via Synthetic People.",
    )
    filename = os.path.basename(file_path)
    message = MessageSchema(
        subject=f"Shared Insights: {report_type}",
        recipients=[recipient_email],
        body=body,
        subtype="html",
        attachments=[{"file": file_path, "headers": {"Content-Disposition": f'attachment; filename="{filename}"'}}],
    )
    await fm.send_message(message)


async def send_enterprise_inquiry_email(user_email: str, user_name: str) -> None:
    """Notify the internal team when a user clicks 'Enterprise Pack'."""
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
