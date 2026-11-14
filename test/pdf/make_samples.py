# Sample PDFs from several producers, for test/t_pdf.js. Output: test/out/pdf/*.pdf
#   python3 test/pdf/make_samples.py
import os, subprocess, sys, textwrap, shutil, zlib
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'pdf')
os.makedirs(OUT, exist_ok=True)
CJK = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'

def reportlab_basic():
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    c = canvas.Canvas(os.path.join(OUT, 'reportlab.pdf'), pagesize=letter)
    c.setFont('Helvetica-Bold', 22); c.drawString(72, 720, 'INVOICE #2026-1184')
    c.setFont('Helvetica', 12); c.drawString(72, 690, 'Bill to: Harbor Street Studio, 41 Mill Lane')
    c.drawString(72, 672, 'Date: November 12, 2026')
    c.setFont('Times-Roman', 14); c.drawString(72, 630, 'Total due: $1,284.00')
    c.setFont('Courier', 11); c.drawString(72, 604, 'Ref: AB-0042-XZ')
    # character spacing, word spacing, horizontal scale, rise, through a text object
    t = c.beginText(72, 560); t.setFont('Helvetica', 13); t.setCharSpace(1.5); t.textLine('Spaced letters here'); t.setCharSpace(0)
    t.setWordSpace(6); t.textLine('Wide word gaps here'); t.setWordSpace(0)
    t.setHorizScale(80); t.textLine('Condensed by scale'); t.setHorizScale(100)
    t.textOut('Due in '); t.setRise(4); t.textOut('30'); t.setRise(0); t.textOut(' days')
    c.drawText(t)
    try:
        pdfmetrics.registerFont(TTFont('DejaVu', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
        c.setFont('DejaVu', 12); c.drawString(72, 470, 'Embedded TrueType: café, naïve, 42 €')
    except Exception as e: print('no dejavu', e)
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    c.setFont('STSong-Light', 16); c.drawString(72, 430, '发票金额：人民币 1,284.00 元')
    c.setFillColorRGB(0.1, 0.25, 0.5); c.rect(72, 360, 260, 40, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1); c.setFont('Helvetica-Bold', 16); c.drawString(86, 374, 'Pay by December 1')
    c.showPage()
    c.setFont('Helvetica', 14); c.drawString(72, 720, 'Page two: terms and notes'); c.drawString(72, 696, 'Late fee 1.5% per month')
    c.showPage(); c.save()

def raw_ops():
    # hand-written content streams: every text operator, two content streams, a scaled CTM, a rotated page, a form XObject
    import pikepdf
    pdf = pikepdf.new()
    font = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica, Encoding=pikepdf.Name.WinAnsiEncoding))
    fontb = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name('/Times-Bold'), Encoding=pikepdf.Name.WinAnsiEncoding))
    res = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font, F2=fontb))
    s1 = b"""q 0.5 0 0 0.5 0 0 cm
BT /F1 28 Tf 144 1400 Td (Line one by Tj) Tj
0 -40 TD (Line two after TD) Tj
T* (Line three after T-star) Tj
(Line four by quote) '
2 0.5 (Line five by double quote) "
0 Tw 0 Tc
1 0 0 1 144 1160 Tm [(Ker)-80(ned )30(TJ ar)-20(ray line)] TJ
/F2 30 Tf 0 -44 Td (First part, ) Tj (second part, ) Tj (third part) Tj
ET
Q
"""
    s2 = b"""BT /F1 -14 Tf -1 0 0 -1 72 480 Tm (Negative size and matrix) Tj ET
BT /F1 14 Tf 72 440 Td <48657820737472696e6720746578742031323334> Tj ET
BT /F1 14 Tf 72 410 Td (Escapes \\(paren\\) and \\\\ back\\163lash) Tj ET
q 1 0 0 1 72 360 cm /Fm1 Do Q
BT /F1 14 Tf 0.9659 0.2588 -0.2588 0.9659 320 300 Tm (Tilted fifteen degrees) Tj ET
"""
    form = pdf.make_stream(b"BT /F1 14 Tf 0 0 Td (Text inside a form XObject) Tj ET")
    form.Type = pikepdf.Name.XObject; form.Subtype = pikepdf.Name.Form; form.BBox = [0, -5, 300, 20]; form.Resources = res
    res.XObject = pikepdf.Dictionary(Fm1=form)
    page = pdf.add_blank_page(page_size=(612, 792))
    page.Resources = res
    page.Contents = pikepdf.Array([pdf.make_stream(s1), pdf.make_stream(s2)])
    # second page: rotated 90, with an offset crop box
    s3 = b"BT /F2 20 Tf 0 1 -1 0 200 100 Tm (Rotated page heading) Tj 0 -30 Td (Amount: 5,600 units) Tj ET"
    p2 = pdf.add_blank_page(page_size=(612, 792)); p2.Resources = res; p2.Contents = pdf.make_stream(s3); p2.Rotate = 90
    p2.CropBox = [36, 36, 576, 756]
    pdf.save(os.path.join(OUT, 'rawops.pdf'))

def latex():
    d = os.path.join(OUT, '_tex'); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, 'tex.tex'), 'w').write(textwrap.dedent(r'''
        \documentclass[12pt]{article}\usepackage[margin=1in]{geometry}\pagestyle{empty}
        \begin{document}
        \section*{Quarterly Report 2026}
        Revenue grew by 14.2 percent over the previous quarter, reaching a total of 3,870 units.
        The office at Wavering Avenue will close on Friday.

        \textbf{Approved by: A. V. Taylor} \hfill \textit{Version 1.03}

        \begin{tabular}{lr} Item & Amount \\ Widgets & 1,250.00 \\ Fittings & 318.40 \\ \end{tabular}
        \end{document}'''))
    r = subprocess.run(['pdflatex', '-interaction=batchmode', 'tex.tex'], cwd=d, capture_output=True)
    if os.path.exists(os.path.join(d, 'tex.pdf')): shutil.copy(os.path.join(d, 'tex.pdf'), os.path.join(OUT, 'latex.pdf'))
    else: print('latex failed')

def libreoffice():
    d = os.path.join(OUT, '_lo'); os.makedirs(d, exist_ok=True)
    html = '''<html><head><meta charset="utf-8"></head><body style="font-family:'Liberation Sans'">
    <h1 style="font-family:'Liberation Serif'">Meeting Notice</h1>
    <p style="font-size:14pt">The annual meeting is on <b>March 18, 2027</b> at 7:30 PM.</p>
    <p style="font-size:12pt;font-family:'DejaVu Sans'">Location: Room 204, Community Hall</p>
    <p style="font-size:14pt;font-family:'Noto Sans CJK SC'">会议时间：2027年3月18日 晚上7点半</p>
    <p style="font-size:13pt;font-family:'Noto Serif CJK SC'">地点：社区活动中心二楼</p>
    </body></html>'''
    open(os.path.join(d, 'lo.html'), 'w', encoding='utf8').write(html)
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf:writer_web_pdf_Export', '--outdir', d, os.path.join(d, 'lo.html')], capture_output=True, timeout=180)
    if os.path.exists(os.path.join(d, 'lo.pdf')): shutil.copy(os.path.join(d, 'lo.pdf'), os.path.join(OUT, 'libreoffice.pdf'))
    else: print('libreoffice failed')

def mpl():
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    for ft, name in ((3, 'mpl_type3.pdf'), (42, 'mpl_type42.pdf')):
        matplotlib.rcParams['pdf.fonttype'] = ft
        fig = plt.figure(figsize=(6, 4)); ax = fig.add_subplot(111)
        ax.plot([1, 2, 3, 4], [3, 5, 4, 7]); ax.set_title('Monthly Sales 2026'); ax.set_xlabel('Quarter number'); ax.set_ylabel('Units sold')
        ax.text(1.2, 6.4, 'Peak: 7 units', fontsize=14)
        fig.savefig(os.path.join(OUT, name)); plt.close(fig)

def special():
    # a scan (pictures only), a protected copy, a copy with an opening password, and a page with a form field and a note over its text
    from PIL import Image
    src = os.path.join(OUT, 'reportlab.pdf')
    subprocess.run(['pdftoppm', '-r', '150', '-f', '1', '-l', '1', '-singlefile', '-png', src, os.path.join(OUT, '_scan')], capture_output=True)
    im = Image.open(os.path.join(OUT, '_scan.png')).convert('RGB')
    im.save(os.path.join(OUT, 'scan.pdf'), resolution=150.0)
    subprocess.run(['qpdf', '--encrypt', '', 'owner-secret', '256', '--modify=none', '--', src, os.path.join(OUT, 'protected.pdf')], capture_output=True)
    subprocess.run(['qpdf', '--encrypt', 'open-sesame', 'owner-secret', '256', '--', src, os.path.join(OUT, 'password.pdf')], capture_output=True)
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    c = canvas.Canvas(os.path.join(OUT, 'form.pdf'), pagesize=letter)
    c.setFont('Helvetica', 14); c.drawString(72, 720, 'Application form 2026'); c.drawString(72, 690, 'Name:')
    c.acroForm.textfield(name='name', value='Jordan Avery', x=130, y=682, width=220, height=24, borderWidth=1, fontName='Helvetica', fontSize=13, forceBorder=True)
    c.drawString(72, 640, 'Reference number 48213')
    c.showPage(); c.save()
    import pikepdf
    pdf = pikepdf.open(os.path.join(OUT, 'form.pdf'), allow_overwriting_input=True)
    page = pdf.pages[0]
    ap = pdf.make_stream(b"1 1 0.6 rg 0 0 150 20 re f BT /Helv 11 Tf 0 g 4 6 Td (Checked by staff) Tj ET")
    ap.Type = pikepdf.Name.XObject; ap.Subtype = pikepdf.Name.Form; ap.BBox = [0, 0, 150, 20]
    ap.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(Helv=pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Font, Subtype=pikepdf.Name.Type1, BaseFont=pikepdf.Name.Helvetica))))
    note = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.Annot, Subtype=pikepdf.Name.FreeText, Rect=[230, 634, 380, 654], Contents='Checked by staff', DA='/Helv 11 Tf 0 g', F=4, AP=pikepdf.Dictionary(N=ap)))
    page.Annots.append(note)
    pdf.save()

def repeat():
    """One name many times over three pages, in several fonts and sizes: for the search."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    c = canvas.Canvas(os.path.join(OUT, 'repeat.pdf'), pagesize=letter)
    c.setFont('Helvetica-Bold', 20); c.drawString(72, 720, 'Harbor Street Studio')
    c.setFont('Times-Roman', 12); c.drawString(72, 690, 'This agreement is made between Harbor Street Studio and the client named below.')
    c.setFont('Helvetica', 11); c.drawString(72, 660, 'Supplier'); c.drawString(330, 660, 'Harbor Street Studio')
    c.setFont('STSong-Light', 13); c.drawString(72, 620, '甲方：海港街工作室（以下简称甲方）')
    c.showPage()
    c.setFont('Times-Roman', 12); c.drawString(72, 720, 'Invoices are issued by Harbor Street Studio; payments go to HARBOR STREET STUDIO only.')
    c.setFont('Helvetica', 11); c.drawString(72, 690, 'Nothing to change on this line.')
    c.setFont('STSong-Light', 13); c.drawString(72, 650, '收款单位为海港街工作室。')
    c.showPage()
    c.setFont('Helvetica', 11); c.drawString(72, 720, 'Signed for and on behalf of')
    c.setFont('Helvetica-Oblique', 12); c.drawString(72, 700, 'Harbor Street Studio')
    c.setFont('Courier', 9); c.drawString(72, 60, 'Harbor Street Studio - page 3 of 3')
    c.showPage(); c.save()

for f in (reportlab_basic, raw_ops, latex, libreoffice, mpl, special, repeat):
    try: f()
    except Exception as e: print(f.__name__, 'failed:', e)
print(sorted(x for x in os.listdir(OUT) if x.endswith('.pdf')))
