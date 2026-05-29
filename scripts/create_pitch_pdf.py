"""
Generate a one-page pitch PDF for home food business clients.
Run: python scripts/create_pitch_pdf.py
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.units import mm, inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER

WIDTH, HEIGHT = A4  # 210mm x 297mm

# Colors
ORANGE = HexColor("#E8600A")
ORANGE_LIGHT = HexColor("#FFF3E0")
ORANGE_DARK = HexColor("#BF360C")
DARK_TEXT = HexColor("#1A1A1A")
GRAY_TEXT = HexColor("#555555")
LIGHT_GRAY = HexColor("#F5F5F5")
GREEN_WA = HexColor("#25D366")
GREEN_BUBBLE = HexColor("#DCF8C6")
WHITE_BUBBLE = HexColor("#FFFFFF")
CHAT_BG = HexColor("#ECE5DD")


def draw_rounded_rect(c, x, y, w, h, r, fill_color=None, stroke_color=None):
    """Draw a rounded rectangle."""
    p = c.beginPath()
    p.roundRect(x, y, w, h, r)
    p.close()
    if fill_color:
        c.setFillColor(fill_color)
    if stroke_color:
        c.setStrokeColor(stroke_color)
        c.drawPath(p, fill=1 if fill_color else 0, stroke=1 if stroke_color else 0)
    else:
        c.drawPath(p, fill=1, stroke=0)


def draw_chat_bubble(c, x, y, text, is_customer=True, max_width=180):
    """Draw a WhatsApp-style chat bubble."""
    style = ParagraphStyle(
        'chat',
        fontSize=6.5,
        leading=8.5,
        fontName='Helvetica',
        textColor=DARK_TEXT,
    )
    p = Paragraph(text, style)
    w_avail = max_width * mm * 0.26
    pw, ph = p.wrap(w_avail, 200)

    padding = 6
    bw = pw + padding * 2
    bh = ph + padding * 2

    if is_customer:
        bx = x + 135  # Right aligned
        color = GREEN_BUBBLE
    else:
        bx = x + 5  # Left aligned
        color = WHITE_BUBBLE

    draw_rounded_rect(c, bx, y - bh, bw, bh, 4, fill_color=color)
    p.drawOn(c, bx + padding, y - bh + padding)
    return bh + 3


def create_pdf(filename="pitch_home_food_bot.pdf"):
    c = canvas.Canvas(filename, pagesize=A4)
    c.setTitle("AI WhatsApp Order Assistant - Home Kitchen")

    y = HEIGHT  # Start from top

    # ─── HEADER BAR ───────────────────────────────────────────
    c.setFillColor(ORANGE)
    c.rect(0, y - 65, WIDTH, 65, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(WIDTH / 2, y - 28, "Your AI Order Assistant on WhatsApp")

    c.setFont("Helvetica", 10)
    c.drawCentredString(WIDTH / 2, y - 45, "Automate your home kitchen orders. Never miss a customer. 24/7.")

    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#FFCC80"))
    c.drawCentredString(WIDTH / 2, y - 58, "Built for home kitchens and tiffin services in Tamil Nadu")

    y -= 72

    # ─── THE PROBLEM ──────────────────────────────────────────
    left_margin = 25
    right_col = WIDTH / 2 + 10

    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, "The Problem")

    y -= 5
    c.setStrokeColor(ORANGE)
    c.setLineWidth(1.5)
    c.line(left_margin, y, left_margin + 80, y)

    y -= 14
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_TEXT)
    problems = [
        "You're cooking AND answering WhatsApp messages",
        "Customers message at dinner rush - you miss orders",
        "Repeating the same menu 50 times a day",
        "Lost orders = lost revenue (avg 15-20 missed orders/week)",
    ]
    for prob in problems:
        c.setFillColor(ORANGE)
        c.drawString(left_margin, y, "X")
        c.setFillColor(GRAY_TEXT)
        c.drawString(left_margin + 14, y, prob)
        y -= 12

    y -= 2

    # ─── THE SOLUTION ─────────────────────────────────────────
    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, "The Solution")

    y -= 5
    c.setStrokeColor(ORANGE)
    c.line(left_margin, y, left_margin + 80, y)

    y -= 14
    c.setFont("Helvetica", 8)
    solutions = [
        "An AI WhatsApp bot that works like your best employee",
        "Shows today's menu to every customer automatically",
        "Takes orders: items, quantity, delivery address",
        "Confirms orders instantly - no waiting",
        "Sends you a notification with confirmed order details",
        "Works 24/7, handles English and Tanglish",
    ]
    for sol in solutions:
        c.setFillColor(GREEN_WA)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(left_margin, y, "+")
        c.setFillColor(GRAY_TEXT)
        c.setFont("Helvetica", 8)
        c.drawString(left_margin + 14, y, sol)
        y -= 12

    y -= 4

    # ─── HOW IT WORKS (3 STEPS) ──────────────────────────────
    c.setFillColor(ORANGE_LIGHT)
    c.rect(15, y - 75, WIDTH - 30, 80, fill=1, stroke=0)

    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, "How It Works - 3 Simple Steps")

    y -= 5
    c.setStrokeColor(ORANGE)
    c.line(left_margin, y, left_margin + 160, y)

    y -= 20
    steps = [
        ("1", "Update Today's Menu", "Open a link on your phone, check today's items. 30 seconds each morning."),
        ("2", "Customers Message You", "They message your WhatsApp number. Bot shows menu and takes orders."),
        ("3", "You Cook & Deliver", "Bot confirms orders and notifies you. You just cook and deliver."),
    ]

    step_width = (WIDTH - 60) / 3
    for i, (num, title, desc) in enumerate(steps):
        sx = left_margin + i * step_width + i * 5

        # Step circle
        c.setFillColor(ORANGE)
        c.circle(sx + 12, y + 5, 10, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(sx + 12, y + 1, num)

        # Step title
        c.setFillColor(DARK_TEXT)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(sx + 26, y + 3, title)

        # Step description
        c.setFillColor(GRAY_TEXT)
        c.setFont("Helvetica", 6.5)
        # Word wrap manually
        words = desc.split()
        line = ""
        line_y = y - 10
        for word in words:
            test = line + " " + word if line else word
            if c.stringWidth(test, "Helvetica", 6.5) > step_width - 30:
                c.drawString(sx + 26, line_y, line)
                line_y -= 9
                line = word
            else:
                line = test
        if line:
            c.drawString(sx + 26, line_y, line)

    y -= 60

    # ─── SAMPLE CONVERSATION ─────────────────────────────────
    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, "See It In Action")

    y -= 5
    c.setStrokeColor(ORANGE)
    c.line(left_margin, y, left_margin + 80, y)

    y -= 8

    # Chat background
    chat_x = left_margin
    chat_h = 155
    draw_rounded_rect(c, chat_x, y - chat_h, 250, chat_h, 6, fill_color=CHAT_BG)

    cy = y - 8
    # Customer message
    bh = draw_chat_bubble(c, chat_x, cy, "hi, lunch menu enna iruku?", is_customer=True)
    cy -= bh + 2

    bh = draw_chat_bubble(c, chat_x, cy,
        "Today's lunch:<br/>Sambar Rice - Rs.60<br/>Biryani - Rs.120<br/>Lemon Rice - Rs.50<br/>Enna order pannuvinga?",
        is_customer=False)
    cy -= bh + 2

    bh = draw_chat_bubble(c, chat_x, cy, "2 sambar rice, 1 biryani, delivery to Adyar", is_customer=True)
    cy -= bh + 2

    bh = draw_chat_bubble(c, chat_x, cy,
        "Order confirmed! 2x Sambar Rice + 1x Biryani = Rs.240. Delivery to Adyar by 12:30 PM. Thank you!",
        is_customer=False)

    # ─── WHAT YOU GET (right side of chat) ────────────────────
    rx = right_col + 5
    ry = y - 2

    # Seller notification box
    draw_rounded_rect(c, rx - 5, ry - 90, 175, 90, 6, fill_color=LIGHT_GRAY)

    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(rx, ry - 12, "What YOU receive on WhatsApp:")

    c.setFont("Courier", 6.5)
    c.setFillColor(DARK_TEXT)
    notif_lines = [
        "CONFIRMED ORDER",
        "Customer: +91-98xxx",
        "2x Sambar Rice - Rs.120",
        "1x Biryani - Rs.120",
        "Total: Rs.240",
        "Deliver to: Adyar",
    ]
    ny = ry - 26
    for line in notif_lines:
        c.drawString(rx + 5, ny, line)
        ny -= 9

    # ─── KEY BENEFITS ─────────────────────────────────────────
    y -= chat_h + 12

    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_margin, y, "Key Benefits")

    y -= 5
    c.setStrokeColor(ORANGE)
    c.line(left_margin, y, left_margin + 70, y)

    y -= 14

    benefits_left = [
        "Never miss an after-hours order",
        "Handle 100+ customers simultaneously",
        "Save 3-4 hours/day on repetitive messages",
    ]
    benefits_right = [
        "Customers get instant replies - no waiting",
        "Works in English and Tanglish",
        "No app download needed - just WhatsApp",
    ]

    c.setFont("Helvetica", 8)
    for i, b in enumerate(benefits_left):
        c.setFillColor(GREEN_WA)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left_margin, y - i * 14, "+")
        c.setFillColor(GRAY_TEXT)
        c.setFont("Helvetica", 8)
        c.drawString(left_margin + 14, y - i * 14, b)

    for i, b in enumerate(benefits_right):
        c.setFillColor(GREEN_WA)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(right_col, y - i * 14, "+")
        c.setFillColor(GRAY_TEXT)
        c.setFont("Helvetica", 8)
        c.drawString(right_col + 14, y - i * 14, b)

    y -= 48

    # ─── BOT vs YOU TABLE ─────────────────────────────────────
    c.setFillColor(ORANGE_LIGHT)
    c.rect(15, y - 48, WIDTH - 30, 53, fill=1, stroke=0)

    c.setFillColor(ORANGE_DARK)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(left_margin, y, "Bot Handles")
    c.drawString(right_col, y, "You Handle")

    y -= 4
    c.setStrokeColor(ORANGE)
    c.line(left_margin, y, left_margin + 70, y)
    c.line(right_col, y, right_col + 70, y)

    y -= 13
    bot_tasks = ["Show menu to customers", "Take orders + calculate total", "Confirm orders instantly", "Answer FAQs (timings, areas)"]
    you_tasks = ["Update menu each morning", "Cook the food", "Deliver orders", "Collect payment"]

    c.setFont("Helvetica", 7.5)
    c.setFillColor(GRAY_TEXT)
    for i in range(4):
        c.drawString(left_margin + 5, y - i * 11, bot_tasks[i])
        c.drawString(right_col + 5, y - i * 11, you_tasks[i])

    y -= 50

    # ─── PRICING + CTA ───────────────────────────────────────
    c.setFillColor(ORANGE)
    c.rect(0, 0, WIDTH, 55, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(WIDTH / 2, 38, "Start Free - No Setup Fee - No Commitment")

    c.setFont("Helvetica", 8.5)
    c.drawCentredString(WIDTH / 2, 24,
        "Free pilot for your first month  |  Simple monthly plan after that  |  Cancel anytime")

    c.setFont("Helvetica-Bold", 9)
    c.setFillColor(HexColor("#FFCC80"))
    c.drawCentredString(WIDTH / 2, 9,
        "Try the live demo: whats-app-integration-six.vercel.app/demo/food")

    # ─── SAVE ─────────────────────────────────────────────────
    c.save()
    print(f"PDF created: {filename}")


if __name__ == "__main__":
    create_pdf()
