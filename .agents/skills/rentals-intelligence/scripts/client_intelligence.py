"""
client_intelligence.py - Babin Rentals Client Persona & Due Recovery Engine

Domain logic for client relationship management:
- Client Persona Classification (§P): Seasoned Pro, Creative Beginner, Corporate/Event
- Due Recovery Messaging (§J4): Staged Nepali business communications (Day 1, 3, 5, 7)
- Loyalty & Risk Tiers
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


COMPANY_SIGNATURE = "Babin Rentals Pvt. Ltd. · Boudha-6, Dibya Marg, Kathmandu 44660 · 9712052571 · babinrentals@gmail.com"


def get_client_persona(client_name: str, order_count: int = 0, flags: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Classifies client per Babin RIS §P into Seasoned Pro, Creative Beginner, or Corporate/Event.
    Determines communication tone, technical depth, and operational safeguards.
    """
    flags = flags or []
    norm_flags = [f.lower() for f in flags]

    if "corporate" in norm_flags or "agency" in norm_flags:
        return {
            "client_name": client_name,
            "persona": "corporate_event",
            "title": "Corporate / Commercial Agency",
            "tone": "Professional, formal, SLA and paper-compliant",
            "technical_depth": "Moderate (provide executive summaries and formal quotation specs)",
            "safeguards": ["Formal invoice with PAN", "Official purchase order acknowledgment"],
            "trust_factor": 1.0
        }

    if order_count >= 5 or "cinematographer" in norm_flags or "dop" in norm_flags:
        return {
            "client_name": client_name,
            "persona": "seasoned_pro",
            "title": "Seasoned Professional / DP",
            "tone": "Direct, technical, concise, peer-to-peer respect",
            "technical_depth": "High (use exact optical, focal, bit-depth, and mount terminology)",
            "safeguards": ["Expedited checkout", "Verified trust rating"],
            "trust_factor": 0.2  # Reduced deposit barrier
        }

    if order_count < 2 or "student" in norm_flags or "beginner" in norm_flags:
        return {
            "client_name": client_name,
            "persona": "creative_beginner",
            "title": "Creative Beginner / Emerging Filmmaker",
            "tone": "Warm, educational, patient, consultative",
            "technical_depth": "Low to medium (explain accessories, power, and handling precautions in plain words)",
            "safeguards": [
                "Mandatory operational briefing at handover",
                "Suggest Camera Caretaker or automated kits",
                "Block unassisted high-risk anamorphic or heavy zooms without supervision"
            ],
            "trust_factor": 1.5  # Standard secured deposit
        }

    return {
        "client_name": client_name,
        "persona": "returning_regular",
        "title": "Returning Client",
        "tone": "Courteous, helpful, efficient",
        "technical_depth": "Medium",
        "safeguards": ["Standard ID and agreement verification"],
        "trust_factor": 1.0
    }


def draft_due_recovery_message(
    client_name: str,
    amount_due_paisa: int,
    day_stage: int
) -> Dict[str, str]:
    """
    Drafts an escalating due recovery message per Babin RIS §J4, respecting
    Nepalese business norms and professional dignity.
    """
    amount_rupees = amount_due_paisa / 100.0
    formatted_amount = f"Rs. {amount_rupees:,.0f}"

    if day_stage <= 1:
        subject = f"Friendly Reminder: Outstanding Invoice Statement — Babin Rentals"
        body = (
            f"Namaste {client_name} Sir/Ma'am,\n\n"
            f"We hope your shoot concluded smoothly and successfully!\n\n"
            f"This is a gentle reminder regarding the outstanding balance of {formatted_amount} "
            f"for your recent equipment rental. Kindly arrange for the settlement at your earliest convenience.\n\n"
            f"If payment has already been initiated via bank transfer, please disregard this message or share the voucher screenshot.\n\n"
            f"Thank you for choosing Babin Rentals!\n\n"
            f"Warm regards,\n"
            f"Accounts Team\n{COMPANY_SIGNATURE}"
        )
    elif day_stage <= 4:
        subject = f"Payment Follow-up: Statement for {client_name} — {formatted_amount}"
        body = (
            f"Namaste {client_name} Sir/Ma'am,\n\n"
            f"Following up on our earlier statement, we have not yet received payment of {formatted_amount}.\n\n"
            f"Could you please confirm the payment timeline today or update us on when the transfer is scheduled? "
            f"Our team is available if you need an updated ledger copy or account details.\n\n"
            f"Best regards,\n"
            f"Babin Rentals Operations\n{COMPANY_SIGNATURE}"
        )
    elif day_stage <= 6:
        subject = f"URGENT: Outstanding Balance Past Due ({formatted_amount}) — Account Notice"
        body = (
            f"Dear {client_name} Sir/Ma'am,\n\n"
            f"This is an urgent notice regarding your overdue balance of {formatted_amount}, which remains unsettled.\n\n"
            f"Per company operating policy, open dues exceeding 5 days trigger a temporary operational hold on future "
            f"gear reservations. We kindly request that you settle this balance within 24 hours to ensure uninterrupted service.\n\n"
            f"Sincerely,\n"
            f"Management\n{COMPANY_SIGNATURE}"
        )
    else:
        subject = f"FINAL NOTICE: Account Freeze Pending Settlement ({formatted_amount})"
        body = (
            f"Dear {client_name},\n\n"
            f"Your account balance of {formatted_amount} is now seriously overdue and has entered formal management review.\n\n"
            f"All active and upcoming gear bookings have been placed on HOLD pending full clearance of this balance. "
            f"Please contact management immediately at 9712052571 to clear this matter today.\n\n"
            f"Babin Rentals Executive Office\n{COMPANY_SIGNATURE}"
        )

    return {
        "client_name": client_name,
        "day_stage": str(day_stage),
        "amount_formatted": formatted_amount,
        "subject": subject,
        "message_body": body
    }
