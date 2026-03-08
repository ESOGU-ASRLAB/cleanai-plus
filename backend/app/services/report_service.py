import os
import io
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Polygon
from beanie import PydanticObjectId
from app.models.report import Report, ReportType
from app.models.workspace.execution import Execution
from app.models.dataset.dataset import Dataset
from app.models.ai_model import AIModelInDB

class ReportService:
    def __init__(self):
        self.upload_dir = "uploads/reports"
        os.makedirs(self.upload_dir, exist_ok=True)

    async def generate_execution_report(
        self, 
        execution: Execution, 
        model_name: str, 
        dataset_name: str,
        preprocessing_name: str,
        preprocessing_steps: list[str] = None,
        preprocessing_code: str = None
    ) -> Report:
        """
        Generates a PDF report for a completed execution with a modern design.
        """
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"execution_report_{execution.id}_{timestamp}.pdf"
        file_path = os.path.join(self.upload_dir, filename)

        # Create PDF with Metadata
        doc = SimpleDocTemplate(
            file_path, 
            pagesize=letter,
            title="CleanAI+ Execution Report",
            author="CleanAI+"
        )
        
        styles = getSampleStyleSheet()
        elements = []
        
        # Define Custom Colors
        primary_color = colors.HexColor('#2563eb') # Blue-600
        secondary_color = colors.HexColor('#1e40af') # Blue-800
        bg_header = colors.HexColor('#f3f4f6') # Gray-100
        text_color = colors.HexColor('#1f2937') # Gray-800
        border_color = colors.HexColor('#e5e7eb') # Gray-200

        # Custom Styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=26,
            leading=32,
            textColor=secondary_color,
            alignment=1, # Center
            spaceAfter=30
        )
        
        subtitle_style = ParagraphStyle(
            'CustomSubtitle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.gray,
            alignment=1, # Center
            spaceAfter=40
        )
        
        section_style = ParagraphStyle(
            'SectionHeader',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=primary_color,
            spaceBefore=20,
            spaceAfter=15,
            borderWidth=0,
        )

        # --- Logo & Header Section ---
        d = Drawing(400, 50)
        
        # Logo Background (Rounded Rect with Gradient approximation color)
        # Using a color that represents the mix of the gradient (#0284c7 to #9333ea)
        logo_color = colors.HexColor('#6366f1') 
        d.add(Rect(0, 10, 32, 32, rx=6, ry=6, fillColor=logo_color, strokeColor=None))
        
        # Logo Icon (Lightning Bolt)
        # Scaled from SVG path M13 10V3L4 14h7v7l9-11h-7z to 32x32 box
        bolt_points = [
            17.33, 28.67,  # Start (13, 10)
            17.33, 38.00,  # Top of vertical line (13, 3)
            5.33,  23.33,  # Left point (4, 14)
            14.67, 23.33,  # Horizontal indent (11, 14)
            14.67, 14.00,  # Bottom point (11, 21)
            26.67, 28.67   # Right point (20, 10)
        ]
        d.add(Polygon(bolt_points, fillColor=colors.white, strokeColor=None))
        
        # Text "CleanAI+"
        d.add(String(42, 18, "CleanAI+", fontName="Helvetica-Bold", fontSize=24, fillColor=text_color))
        
        elements.append(d)
        elements.append(Paragraph("Execution Report", title_style))
        elements.append(Paragraph(f"Generated on {datetime.now().strftime('%d %B %Y, %H:%M')}", subtitle_style))

        # Helper to create styled tables
        def create_modern_table(data, colWidths=None):
            t = Table(data, colWidths=colWidths)
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, 0), bg_header), # Header row background (if applicable) or Left column
                ('TEXTCOLOR', (0, 0), (-1, -1), text_color),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 0.5, border_color),
            ]))
             # Make keys bold/colored if it's a key-value list (2 columns)
            if len(data[0]) == 2:
                t.setStyle(TableStyle([
                    ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                    ('TEXTCOLOR', (0, 0), (0, -1), secondary_color),
                    ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#f8fafc')),
                ]))
            return t

        # 1. Overview Section
        elements.append(Paragraph("1. Execution Overview", section_style))
        overview_data = [
            ["Execution ID", str(execution.id)],
            ["Status", execution.status],
            ["Created At", execution.created_at.strftime('%Y-%m-%d %H:%M:%S')],
            ["Completed At", execution.completed_at.strftime('%Y-%m-%d %H:%M:%S') if execution.completed_at else "N/A"],
            ["Duration", self._calculate_duration(execution)]
        ]
        elements.append(create_modern_table(overview_data, colWidths=[150, 350]))
        elements.append(Spacer(1, 15))

        # 2. Resources & Steps
        elements.append(Paragraph("2. Resources & Configuration", section_style))
        
        # Helper to create label-value pairs for grid cells
        def make_cell(label, value):
            return [
                Paragraph(f"<font color='#1e40af'><b>{label}:</b></font>", styles['Normal']),
                Paragraph(f"{value}", styles['Normal'])
            ]

        # Row 1: Model | Dataset
        row1 = [
            make_cell("AI Model", model_name),
            make_cell("Dataset", dataset_name)
        ]
        
        # Row 2: Pipeline | Batch Size
        batch_size = execution.config.get("batch_size", "N/A")
        row2 = [
            make_cell("Preprocessing", preprocessing_name),
            make_cell("Batch Size", str(batch_size))
        ]
        
        # Row 3: Device | Samples
        device = execution.config.get("device", "cpu")
        limit = execution.config.get("limit_samples", "All")
        if limit == 0: limit = "All"
        
        row3 = [
            make_cell("Device", str(device)),
            make_cell("Sample Limit", str(limit))
        ]

        # Compile grid data
        resource_grid_data = [row1, row2, row3]
        
        # Create Table for Resources (2 main columns, split internally or just 2 big cells)
        # We can simulate 2 columns where each cell contains the paragraph list
        t_resources = Table(resource_grid_data, colWidths=[250, 250])
        t_resources.setStyle(TableStyle([
            ('GRID', (0, 0), (-1, -1), 0.5, border_color),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ]))
        elements.append(t_resources)
        
        # Pipeline Code / Steps Section
        elements.append(Spacer(1, 10))
        
        pipeline_content = []
        if preprocessing_code:
            safe_code = preprocessing_code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            safe_code = safe_code.replace("\n", "<br/>").replace(" ", "&nbsp;")
            code_content = f"""<font name="Courier" size="9">{safe_code}</font>"""
            pipeline_content = [Paragraph("<b>Pipeline Code:</b>", styles['Normal']), Paragraph(code_content, styles['Normal'])]
        elif preprocessing_steps:
             steps_content = "<br/>".join([f"&bull; {step}" for step in preprocessing_steps])
             pipeline_content = [Paragraph("<b>Pipeline Steps:</b>", styles['Normal']), Paragraph(steps_content, styles['Normal'])]
        else:
             pipeline_content = [Paragraph("<b>Pipeline Steps:</b>", styles['Normal']), "No custom steps."]
             
        # Full width table for code
        t_code = Table([pipeline_content], colWidths=[100, 400])
        t_code.setStyle(TableStyle([
             ('GRID', (0, 0), (-1, 0), 0.5, border_color),
             ('VALIGN', (0, 0), (-1, -1), 'TOP'),
             ('BACKGROUND', (0, 0), (0, 0), bg_header),
        ]))
        elements.append(t_code)

        elements.append(Spacer(1, 15))

        # 3. Results & Metrics
        elements.append(Paragraph("3. Performance Results", section_style))
        
        if execution.metrics:
            grid_data = []
            row = []
            
            # Sort metrics: Accuracy, Top5, Loss, Precision, Recall, F1, then others
            _exclude_keys = {
                "processed_samples",
                "confusion_matrix", "confusion_matrix_labels",
                "class_accuracy_top3", "class_accuracy_bottom3",
                "topk_accuracies",
            }
            priority = ["accuracy", "top5_accuracy", "loss", "precision", "recall", "f1_score"]
            items = [
                x for x in execution.metrics.items()
                if x[0] not in _exclude_keys
            ]
            items.sort(key=lambda x: priority.index(x[0]) if x[0] in priority else 999)
            
            # Custom style for centered metrics
            metric_style_center = ParagraphStyle(
                'MetricCenter',
                parent=styles['Normal'],
                alignment=1 # Center
            )

            for k, v in items:
                label_text = k.replace("_", " ").title()
                if k == "emissions":
                    label_text = "CO2 Emissions (g)"
                    value_text = f"{float(v):.2f}"
                elif k == "emissions_per_min":
                    label_text = "Emissions / Min (g)"
                    value_text = f"{float(v):.2f}"
                else:
                    value_text = str(v)
                
                # Stack Label and Value
                cell_content = [
                    Paragraph(f"<font color='#6b7280' size='9'>{label_text}</font>", metric_style_center),
                    Spacer(1, 6),
                    Paragraph(f"<font color='#2563eb' size='14'><b>{value_text}</b></font>", metric_style_center)
                ]
                row.append(cell_content)
                
                if len(row) == 3:
                    grid_data.append(row)
                    row = []
            
            # Fill remaining cells
            if row:
                while len(row) < 3:
                    row.append("")
                grid_data.append(row)

            # Table with 3 equal columns
            t_metrics = Table(grid_data, colWidths=[150, 150, 150])
            t_metrics.setStyle(TableStyle([
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('GRID', (0, 0), (-1, -1), 0.5, border_color),
                ('BACKGROUND', (0, 0), (-1, -1), colors.white),
                ('TOPPADDING', (0, 0), (-1, -1), 15),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
            ]))
            elements.append(t_metrics)
        else:
             elements.append(Paragraph("No metrics available yet.", styles['Normal']))

        # 4. Confusion Matrix
        cm_data   = execution.metrics.get("confusion_matrix")
        cm_labels = execution.metrics.get("confusion_matrix_labels", [])
        if cm_data and cm_labels:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as _plt
            import numpy as _np
            from sklearn.metrics import ConfusionMatrixDisplay as _CMD

            n = len(cm_labels)
            elements.append(Paragraph("4. Confusion Matrix", section_style))

            _cm_array = _np.array(cm_data, dtype=int)
            _do_plot  = False
            _note_text = None

            if n > 20:
                # Sub-matrix: top-7 best + bottom-3 worst classes
                _top7_lbl    = [x["label"] for x in execution.metrics.get("class_accuracy_top3",    [])]
                _bottom3_lbl = [x["label"] for x in execution.metrics.get("class_accuracy_bottom3", [])]
                _seen, _subset_labels = set(), []
                for _lbl in _top7_lbl + _bottom3_lbl:
                    if _lbl not in _seen:
                        _seen.add(_lbl)
                        _subset_labels.append(_lbl)
                _lbl_to_idx  = {_l: _i for _i, _l in enumerate(cm_labels)}
                _sub_indices = [_lbl_to_idx[_l] for _l in _subset_labels if _l in _lbl_to_idx]
                if not _sub_indices:
                    elements.append(Paragraph(
                        f"The confusion matrix has {n} classes and is too large to render.",
                        styles["Normal"]
                    ))
                else:
                    _ix       = _np.array(_sub_indices)
                    _cm_plot  = _cm_array[_np.ix_(_ix, _ix)]
                    _lbl_plot = [cm_labels[_i] for _i in _sub_indices]
                    _note_text = (
                        f"Full matrix has {n} classes. "
                        f"Showing {len(_sub_indices)}×{len(_sub_indices)} sub-matrix "
                        f"for the best and worst performing classes."
                    )
                    _do_plot = True
            else:
                _cm_plot  = _cm_array
                _lbl_plot = cm_labels
                _do_plot  = True

            if _do_plot:
                if _note_text:
                    elements.append(Paragraph(_note_text, styles["Normal"]))
                    elements.append(Spacer(1, 6))

                _sz = max(5, len(_lbl_plot) * 0.8)
                _fig, _ax = _plt.subplots(figsize=(_sz, _sz))
                _disp = _CMD(confusion_matrix=_cm_plot, display_labels=_lbl_plot)
                _disp.plot(ax=_ax, colorbar=True, cmap="Blues", xticks_rotation=45)
                _ax.set_xlabel("Predicted", fontsize=10)
                _ax.set_ylabel("Actual", fontsize=10)
                _tick_fs = max(6, 9 - len(_lbl_plot) // 4)
                _ax.tick_params(axis="x", labelsize=_tick_fs)
                _ax.tick_params(axis="y", labelsize=_tick_fs)
                _plt.tight_layout()

                _buf = io.BytesIO()
                _fig.savefig(_buf, format="png", dpi=150, bbox_inches="tight")
                _plt.close(_fig)
                _buf.seek(0)

                _img_w = 450.0
                _img_h = _img_w
                elements.append(RLImage(_buf, width=_img_w, height=_img_h))
                elements.append(Spacer(1, 6))
                _cm_note_sty = ParagraphStyle("CmNote", parent=styles["Italic"],
                                              fontSize=8, textColor=colors.gray)
                elements.append(Paragraph(
                    "Rows = actual · Columns = predicted · "
                    "Cell values = sample counts.",
                    _cm_note_sty
                ))
                elements.append(Spacer(1, 10))
        # 5. Class-wise Accuracy (Top 3 & Bottom 3)
        top3    = execution.metrics.get("class_accuracy_top3",    [])
        bottom3 = execution.metrics.get("class_accuracy_bottom3", [])
        if top3 or bottom3:
            elements.append(Paragraph("5. Class-wise Accuracy", section_style))

            C_BAR_GOOD = colors.HexColor('#10b981')  # green / correct
            C_BAR_BAD  = colors.HexColor('#ef4444')  # red   / worst
            C_BAR_BG   = colors.HexColor('#e5e7eb')  # track bg

            lbl_sty_ca = ParagraphStyle('CAlbl', parent=styles['Normal'], fontSize=9)
            val_sty_ca = ParagraphStyle('CAval', parent=styles['Normal'], fontSize=9, alignment=2)
            BAR_W = 260  # max bar width (pt)

            def ca_rows(items, bar_color, heading):
                """Build table rows for a group (top / bottom)."""
                rows = []
                header_p = Paragraph(f"<b>{heading}</b>",
                                     ParagraphStyle('CAh', parent=styles['Normal'], fontSize=9,
                                                   textColor=colors.HexColor('#374151')))
                rows.append([header_p, '', ''])
                for item in items:
                    pct  = item['accuracy'] * 100
                    fill = int(BAR_W * item['accuracy'])
                    rest = BAR_W - fill

                    bar_d = Drawing(BAR_W, 14)
                    bar_d.add(Rect(0, 3, BAR_W, 8, fillColor=C_BAR_BG, strokeColor=None))
                    if fill > 0:
                        bar_d.add(Rect(0, 3, fill, 8, fillColor=bar_color, strokeColor=None))
                    rows.append([
                        Paragraph(item['label'], lbl_sty_ca),
                        bar_d,
                        Paragraph(f"{pct:.1f}%", val_sty_ca),
                    ])
                return rows

            ca_data = []
            if top3:
                ca_data += ca_rows(top3, C_BAR_GOOD, "⬆ Top classes")
            if bottom3:
                ca_data += ca_rows(bottom3, C_BAR_BAD, "⬇ Bottom classes")

            ca_table = Table(ca_data, colWidths=[110, BAR_W, 50])
            ca_table.setStyle(TableStyle([
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING',    (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('SPAN',          (0, 0), (-1,  0), ),  # heading row spans all cols
                ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#f3f4f6')),
            ]))

            # Reuse header logic for bottom3 group header row (2nd group starts after top3+1)
            if top3 and bottom3:
                hdr2_row = len(top3) + 1   # 0-based index of bottom group header
                ca_table.setStyle(TableStyle([
                    ('SPAN',       (0, hdr2_row), (-1, hdr2_row)),
                    ('BACKGROUND', (0, hdr2_row), (-1, hdr2_row), colors.HexColor('#f3f4f6')),
                ]))

            elements.append(ca_table)
            elements.append(Spacer(1, 10))

        # 6. Top-K Accuracy
        topk = execution.metrics.get("topk_accuracies")
        if topk:
            elements.append(Paragraph("6. Top-K Accuracy", section_style))

            C_TOPK_BAR = colors.HexColor('#6366f1')  # indigo
            C_TOPK_BG  = colors.HexColor('#e5e7eb')
            TOPK_BAR_W = 300

            lbl_tk = ParagraphStyle('TKlbl', parent=styles['Normal'], fontSize=9)
            val_tk = ParagraphStyle('TKval', parent=styles['Normal'], fontSize=9, alignment=2)

            topk_rows = [[
                Paragraph("<b>K</b>", lbl_tk),
                Paragraph("<b>Accuracy</b>", lbl_tk),
                Paragraph("", lbl_tk),
            ]]
            for k in sorted(topk.keys(), key=int):
                acc = float(topk[k])
                fill = int(TOPK_BAR_W * acc)
                bar_d = Drawing(TOPK_BAR_W, 14)
                bar_d.add(Rect(0, 3, TOPK_BAR_W, 8, fillColor=C_TOPK_BG, strokeColor=None))
                if fill > 0:
                    bar_d.add(Rect(0, 3, fill, 8, fillColor=C_TOPK_BAR, strokeColor=None))
                topk_rows.append([
                    Paragraph(f"Top-{k}", lbl_tk),
                    bar_d,
                    Paragraph(f"{acc*100:.1f}%", val_tk),
                ])

            topk_table = Table(topk_rows, colWidths=[55, TOPK_BAR_W, 50])
            topk_table.setStyle(TableStyle([
                ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING',    (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('BACKGROUND',    (0, 0), (-1,  0), colors.HexColor('#f3f4f6')),
                ('FONTNAME',      (0, 0), (-1,  0), 'Helvetica-Bold'),
                ('GRID',          (0, 0), (-1, -1), 0.3, colors.HexColor('#e5e7eb')),
            ]))
            elements.append(topk_table)
            elements.append(Spacer(1, 10))

        # Footer Note
        elements.append(Spacer(1, 40))
        note_style = ParagraphStyle('Note', parent=styles['Italic'], fontSize=9, textColor=colors.gray)
        elements.append(Paragraph("This report was automatically generated by CleanAI+ Platform.", note_style))

        # Build PDF
        doc.build(elements)

        # Save to DB
        report = Report(
            workspace_id=execution.workspace_id,
            reference_id=execution.id,
            reference_type=ReportType.EXECUTION,
            name=f"Report: {model_name}",
            file_path=file_path,
            metadata={
                "model_name": model_name,
                "dataset_name": dataset_name
            }
        )
        await report.insert()
        return report

    def _calculate_duration(self, execution: Execution) -> str:
        if execution.started_at and execution.completed_at:
            duration = execution.completed_at - execution.started_at
            total_seconds = int(duration.total_seconds())
            return f"{total_seconds} seconds"
        return "Unknown"

    # ================================================================== #
    # OPTIMIZATION REPORT                                                 #
    # ================================================================== #
    async def generate_optimization_report(
        self,
        optimization,
        model_name: str,
        dataset_name: str,
        preprocessing_name: str,
        timing: dict,
        layer_changes: list,
    ) -> Report:
        """Generate a comprehensive PDF report for a completed pruning optimization."""
        from reportlab.graphics.shapes import Line    # noqa: F401 (kept for future)

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        filename = f"optimization_report_{optimization.id}_{timestamp}.pdf"
        file_path = os.path.join(self.upload_dir, filename)

        PAGE_W, _ = letter
        MARGIN = 40
        CW = PAGE_W - 2 * MARGIN          # 532 pt usable width

        doc = SimpleDocTemplate(
            file_path, pagesize=letter,
            title="CleanAI+ Optimization Report", author="CleanAI+",
            rightMargin=MARGIN, leftMargin=MARGIN,
            topMargin=MARGIN, bottomMargin=MARGIN,
        )

        styles = getSampleStyleSheet()
        elements = []

        # ---- colours -------------------------------------------------- #
        C_PRIMARY    = colors.HexColor('#2563eb')
        C_SECONDARY  = colors.HexColor('#1e40af')
        C_SUCCESS    = colors.HexColor('#10b981')
        C_WARN       = colors.HexColor('#f59e0b')
        C_PURPLE     = colors.HexColor('#7c3aed')
        C_GRAY_800   = colors.HexColor('#1f2937')
        C_GRAY_500   = colors.HexColor('#6b7280')
        C_GRAY_200   = colors.HexColor('#e5e7eb')
        C_GRAY_50    = colors.HexColor('#f9fafb')
        C_GRAY_100   = colors.HexColor('#f3f4f6')
        C_BAR_BEFORE = colors.HexColor('#9ca3af')
        C_BAR_AFTER  = colors.HexColor('#10b981')

        # ---- paragraph styles ----------------------------------------- #
        title_style = ParagraphStyle(
            'OT', parent=styles['Title'],
            fontSize=24, leading=30, textColor=C_SECONDARY,
            alignment=1, spaceAfter=6,
        )
        subtitle_style = ParagraphStyle(
            'OS', parent=styles['Normal'],
            fontSize=10, textColor=C_GRAY_500, alignment=1, spaceAfter=20,
        )
        section_style = ParagraphStyle(
            'OSec', parent=styles['Heading2'],
            fontSize=13, textColor=C_PRIMARY,
            spaceBefore=16, spaceAfter=8,
        )
        note_style = ParagraphStyle(
            'ON', parent=styles['Italic'],
            fontSize=8, textColor=C_GRAY_500,
        )

        # ---- helpers -------------------------------------------------- #
        def fmt_num(n):
            try: return f"{int(n):,}"
            except Exception: return str(n)

        def fmt_macs(n):
            n = int(n)
            if n >= 1_000_000_000: return f"{n/1e9:.3f} G"
            if n >= 1_000_000:     return f"{n/1e6:.1f} M"
            return f"{n/1e3:.1f} K"

        def fmt_flops(n):
            n = int(n)
            if n >= 1_000_000_000: return f"{n/1e9:.3f} G"
            if n >= 1_000_000:     return f"{n/1e6:.1f} M"
            return f"{n/1e3:.1f} K"

        def fmt_mb(b):
            return f"{int(b)/(1024*1024):.2f} MB"

        def pct_color(pct):
            if pct >= 40:  return C_SUCCESS
            if pct >= 20:  return C_WARN
            return C_PURPLE

        def kv_table(rows):
            t = Table(rows, colWidths=[160, CW - 160])
            t.setStyle(TableStyle([
                ('GRID',          (0, 0), (-1, -1), 0.5,  C_GRAY_200),
                ('FONTNAME',      (0, 0), (0,  -1), 'Helvetica-Bold'),
                ('FONTNAME',      (1, 0), (1,  -1), 'Helvetica'),
                ('FONTSIZE',      (0, 0), (-1, -1), 9),
                ('TEXTCOLOR',     (0, 0), (0,  -1), C_SECONDARY),
                ('TEXTCOLOR',     (1, 0), (1,  -1), C_GRAY_800),
                ('BACKGROUND',    (0, 0), (0,  -1), C_GRAY_50),
                ('BACKGROUND',    (1, 0), (1,  -1), colors.white),
                ('TOPPADDING',    (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('LEFTPADDING',   (0, 0), (-1, -1), 10),
            ]))
            return t

        def stat_cards(cards):
            """3-per-row cards: (label, value, note)."""
            while len(cards) % 3:
                cards.append(("", "", ""))
            rows = []
            for i in range(0, len(cards), 3):
                row = []
                for label, value, note in cards[i:i+3]:
                    cell = []
                    if label:
                        cell.append(Paragraph(f'<font color="#6b7280" size="8">{label}</font>', styles['Normal']))
                        cell.append(Spacer(1, 4))
                        cell.append(Paragraph(f'<font color="#1e40af" size="14"><b>{value}</b></font>', styles['Normal']))
                        if note:
                            cell.append(Spacer(1, 2))
                            cell.append(Paragraph(f'<font color="#10b981" size="8">{note}</font>', styles['Normal']))
                    row.append(cell)
                rows.append(row)
            cw3 = CW / 3
            t = Table(rows, colWidths=[cw3, cw3, cw3])
            t.setStyle(TableStyle([
                ('GRID',          (0, 0), (-1, -1), 0.5, C_GRAY_200),
                ('BACKGROUND',    (0, 0), (-1, -1), colors.white),
                ('TOPPADDING',    (0, 0), (-1, -1), 14),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
                ('LEFTPADDING',   (0, 0), (-1, -1), 12),
                ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
            ]))
            return t

        def cmp_bar(label_a, val_a, fmt_a, label_b, val_b, fmt_b, reduction_pct=None, title=""):
            """Two horizontal bars, value labels after bars, optional reduction badge."""
            w, h = CW - 4, (88 if title else 72)
            d = Drawing(w, h)
            TITLE_H = 16 if title else 0
            LBL_W, VAL_R = 70, 88
            bar_area = w - LBL_W - VAL_R
            max_v = max(val_a, val_b, 1)

            if title:
                d.add(String(0, h - 12, title, fontName='Helvetica-Bold',
                             fontSize=9, fillColor=C_GRAY_800))

            # Bar A (before — gray)
            bw_a = max(3, int(val_a / max_v * bar_area))
            y_a = 44 + TITLE_H // 2
            d.add(String(0, y_a + 3, "Before", fontName='Helvetica', fontSize=8, fillColor=C_GRAY_500))
            d.add(Rect(LBL_W, y_a - 1, bw_a, 16, fillColor=C_BAR_BEFORE, strokeColor=None))
            d.add(String(LBL_W + bw_a + 5, y_a + 3, fmt_a,
                         fontName='Helvetica', fontSize=8, fillColor=C_GRAY_800))

            # Bar B (after — green)
            bw_b = max(3, int(val_b / max_v * bar_area))
            y_b = 18 + TITLE_H // 2
            d.add(String(0, y_b + 3, "After", fontName='Helvetica-Bold', fontSize=8, fillColor=C_GRAY_800))
            d.add(Rect(LBL_W, y_b - 1, bw_b, 16, fillColor=C_BAR_AFTER, strokeColor=None))
            d.add(String(LBL_W + bw_b + 5, y_b + 3, fmt_b,
                         fontName='Helvetica-Bold', fontSize=8, fillColor=C_SUCCESS))

            # Reduction badge (right-aligned)
            if reduction_pct is not None and reduction_pct > 0:
                bx = w - 62
                by = TITLE_H // 2 + 22
                d.add(Rect(bx, by, 60, 20, fillColor=pct_color(reduction_pct),
                           strokeColor=None, rx=4, ry=4))
                d.add(String(bx + 30, by + 5, f"\u25bc {reduction_pct}%",
                             fontName='Helvetica-Bold', fontSize=8.5,
                             fillColor=colors.white, textAnchor='middle'))
            return d

        def bar_section(drawing):
            t = Table([[drawing]], colWidths=[CW])
            t.setStyle(TableStyle([
                ('TOPPADDING',    (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
                ('LEFTPADDING',   (0, 0), (-1, -1), 10),
                ('BACKGROUND',    (0, 0), (-1, -1), colors.white),
                ('GRID',          (0, 0), (-1, -1), 0.5, C_GRAY_200),
            ]))
            return t

        # ---- pull data ------------------------------------------------ #
        result   = optimization.result or {}
        config   = optimization.config or {}

        orig_params  = int(result.get("original_params", 0))
        prnd_params  = int(result.get("pruned_params", 0))
        param_pct    = float(result.get("param_reduction_pct", 0))
        orig_macs    = int(result.get("original_macs", 0))
        prnd_macs    = int(result.get("pruned_macs", 0))
        mac_pct      = float(result.get("mac_reduction_pct", 0))
        orig_flops   = int(result.get("original_flops", orig_macs * 2))
        prnd_flops   = int(result.get("pruned_flops", prnd_macs * 2))
        flop_pct     = float(result.get("flop_reduction_pct", mac_pct))
        orig_bytes   = int(result.get("original_size_bytes", 0))
        prnd_bytes   = int(result.get("pruned_size_bytes", 0))
        size_pct     = round((1 - prnd_bytes / max(orig_bytes, 1)) * 100, 1) if orig_bytes else 0
        output_name  = result.get("output_model_name", "—")

        before_ms   = float(timing.get("before_ms", 0))
        after_ms    = float(timing.get("after_ms", 0))
        before_thr  = float(timing.get("before_throughput", 0))
        after_thr   = float(timing.get("after_throughput", 0))
        speedup     = round(before_ms / after_ms, 2) if after_ms > 0 else 0
        thr_gain    = round((after_thr / max(before_thr, 1e-9) - 1) * 100, 1) if before_thr else 0
        latency_red = round((1 - after_ms / before_ms) * 100, 1) if before_ms > 0 else 0

        pruning_ratio   = config.get("pruning_ratio", "—")
        importance_type = config.get("importance_type", "—")
        iterative_steps = config.get("iterative_steps", 1)
        device_str      = config.get("device", "cpu")
        global_pruning  = config.get("global_pruning", False)
        isomorphic      = config.get("isomorphic", False)
        taylor_samples  = config.get("taylor_num_samples", "—")
        ignore_head     = config.get("ignore_head", True)
        ignored_layers  = config.get("ignored_layer_names", [])

        if optimization.started_at and optimization.completed_at:
            dur_s = int((optimization.completed_at - optimization.started_at).total_seconds())
            duration_str = f"{dur_s // 60}m {dur_s % 60}s" if dur_s >= 60 else f"{dur_s}s"
        else:
            duration_str = "—"

        # ================================================================ #
        # HEADER
        # ================================================================ #
        logo_d = Drawing(CW, 52)
        logo_bg = colors.HexColor('#6366f1')
        logo_d.add(Rect(0, 10, 32, 32, rx=6, ry=6, fillColor=logo_bg, strokeColor=None))
        bolt_pts = [17.33, 28.67, 17.33, 38.00, 5.33, 23.33,
                    14.67, 23.33, 14.67, 14.00, 26.67, 28.67]
        logo_d.add(Polygon(bolt_pts, fillColor=colors.white, strokeColor=None))
        logo_d.add(String(42, 20, "CleanAI+", fontName="Helvetica-Bold",
                          fontSize=22, fillColor=C_GRAY_800))
        elements.append(logo_d)
        elements.append(Paragraph("Network Optimization Report", title_style))
        elements.append(Paragraph(
            f"Generated on {datetime.utcnow().strftime('%d %B %Y, %H:%M')} UTC",
            subtitle_style,
        ))
        # Top divider
        div = Drawing(CW, 4)
        div.add(Rect(0, 1, CW, 2.5, fillColor=C_PRIMARY, strokeColor=None))
        elements.append(div)
        elements.append(Spacer(1, 12))

        # ================================================================ #
        # 1. OVERVIEW
        # ================================================================ #
        elements.append(Paragraph("1. Optimization Overview", section_style))
        elements.append(kv_table([
            ["Optimization ID",  str(optimization.id)],
            ["Status",           "\u2713  Completed"],
            ["Original Model",   model_name],
            ["Pruned Model",     output_name],
            ["Dataset",          dataset_name],
            ["Preprocessing",    preprocessing_name or "—"],
            ["Started",          optimization.started_at.strftime('%Y-%m-%d %H:%M:%S')
                                 if optimization.started_at else "—"],
            ["Completed",        optimization.completed_at.strftime('%Y-%m-%d %H:%M:%S')
                                 if optimization.completed_at else "—"],
            ["Duration",         duration_str],
            ["Device",           device_str.upper()],
        ]))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 2. CONFIGURATION
        # ================================================================ #
        elements.append(Paragraph("2. Pruning Configuration", section_style))
        cfg_rows = [
            ["Pruning Ratio",        f"{float(pruning_ratio) * 100:.0f}%"],
            ["Importance Criterion", str(importance_type).replace("_", " ").title()],
            ["Iterative Steps",      str(iterative_steps)],
            ["Global Pruning",       "Yes" if global_pruning else "No"],
            ["Isomorphic",           "Yes" if isomorphic else "No"],
            ["Ignore Classifier Head","Yes" if ignore_head else "No"],
            ["Manually Ignored Layers", f"{len(ignored_layers)} layer(s)"],
        ]
        if importance_type == "taylor":
            cfg_rows.append(["Taylor Calibration Samples", str(taylor_samples)])
        elements.append(kv_table(cfg_rows))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 3. COMPRESSION STATISTICS
        # ================================================================ #
        elements.append(Paragraph("3. Compression Statistics", section_style))
        elements.append(stat_cards([
            ("Parameters — Before", fmt_num(orig_params), ""),
            ("Parameters — After",  fmt_num(prnd_params),  f"\u25bc {param_pct}% reduction"),
            ("Parameter Reduction", f"{param_pct}%",       ""),
            ("MACs — Before",       fmt_macs(orig_macs),   ""),
            ("MACs — After",        fmt_macs(prnd_macs),   f"\u25bc {mac_pct}% reduction"),
            ("MACs Reduction",      f"{mac_pct}%",         ""),
            ("FLOPs — Before",      fmt_flops(orig_flops), ""),
            ("FLOPs — After",       fmt_flops(prnd_flops), f"\u25bc {flop_pct}% reduction"),
            ("FLOPs Reduction",     f"{flop_pct}%",        ""),
            ("File Size — Before",  fmt_mb(orig_bytes),    ""),
            ("File Size — After",   fmt_mb(prnd_bytes),    f"\u25bc {size_pct}% reduction"),
            ("Size Reduction",      f"{size_pct}%",        ""),
        ]))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 4. BEFORE / AFTER COMPARISON (bar charts)
        # ================================================================ #
        elements.append(Paragraph("4. Before / After Comparison", section_style))
        for bar in [
            cmp_bar("Before", orig_params, fmt_num(orig_params),
                    "After",  prnd_params,  fmt_num(prnd_params),
                    reduction_pct=param_pct, title="Parameters"),
            cmp_bar("Before", orig_macs, fmt_macs(orig_macs),
                    "After",  prnd_macs,  fmt_macs(prnd_macs),
                    reduction_pct=mac_pct, title="MACs (multiply-accumulate operations)"),
            cmp_bar("Before", orig_flops, fmt_flops(orig_flops),
                    "After",  prnd_flops,  fmt_flops(prnd_flops),
                    reduction_pct=flop_pct, title="FLOPs (floating-point operations = 2 \u00d7 MACs)"),
            cmp_bar("Before", orig_bytes, fmt_mb(orig_bytes),
                    "After",  prnd_bytes,  fmt_mb(prnd_bytes),
                    reduction_pct=size_pct, title="File Size on Disk"),
        ]:
            elements.append(bar_section(bar))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 5. RUNTIME PERFORMANCE
        # ================================================================ #
        elements.append(Paragraph("5. Runtime Performance", section_style))
        if before_ms > 0 or after_ms > 0:
            perf_cards = []
            if before_ms > 0:
                perf_cards.append(("Inference Latency — Before", f"{before_ms:.2f} ms / image", ""))
            if after_ms > 0:
                perf_cards.append(("Inference Latency — After", f"{after_ms:.2f} ms / image",
                                   f"\u25bc {latency_red}% faster" if before_ms > 0 else ""))
            if speedup > 0:
                perf_cards.append(("Speedup", f"{speedup}\u00d7", ""))
            if before_thr > 0:
                perf_cards.append(("Throughput — Before", f"{before_thr:.1f} img/s", ""))
            if after_thr > 0:
                perf_cards.append(("Throughput — After", f"{after_thr:.1f} img/s",
                                   f"\u25b2 {thr_gain}%" if thr_gain > 0 else ""))
            if thr_gain > 0:
                perf_cards.append(("Throughput Gain", f"+{thr_gain}%", ""))
            elements.append(stat_cards(perf_cards))
            if before_ms > 0 and after_ms > 0:
                elements.append(Spacer(1, 6))
                elements.append(bar_section(
                    cmp_bar("Before", before_ms, f"{before_ms:.2f} ms",
                            "After",  after_ms,  f"{after_ms:.2f} ms",
                            reduction_pct=latency_red,
                            title="Inference Latency per Image (lower is better)")
                ))
        else:
            elements.append(Paragraph(
                "Inference timing not available — timing measurement was skipped or failed.",
                note_style,
            ))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 6. LAYER-BY-LAYER ANALYSIS
        # ================================================================ #
        elements.append(Paragraph("6. Layer-by-Layer Pruning Analysis", section_style))
        if layer_changes:
            total_lc = len(layer_changes)
            shown    = min(total_lc, 40)
            elements.append(Paragraph(
                f"{total_lc} layer(s) were structurally modified. "
                f"Sorted by reduction \u2014 top {shown} shown.",
                note_style,
            ))
            elements.append(Spacer(1, 6))
            COL_N, COL_T, COL_B, COL_A, COL_P = 175, 65, 90, 90, 72
            layer_data = [["Layer", "Type", "Before", "After", "Reduction"]]
            for lc in layer_changes[:shown]:
                name = lc["name"]
                if len(name) > 28: name = "\u2026" + name[-26:]
                ltype = (lc["type"].replace("BatchNorm2d", "BN2d")
                                   .replace("BatchNorm1d", "BN1d"))
                layer_data.append([
                    name, ltype,
                    f"{lc['before_in']}\u2192{lc['before_out']}",
                    f"{lc['after_in']}\u2192{lc['after_out']}",
                    f"{lc['reduction_pct']}%",
                ])
            lt_style = [
                ('BACKGROUND',    (0, 0), (-1, 0),  C_SECONDARY),
                ('TEXTCOLOR',     (0, 0), (-1, 0),  colors.white),
                ('FONTNAME',      (0, 0), (-1, 0),  'Helvetica-Bold'),
                ('FONTSIZE',      (0, 0), (-1, 0),  9),
                ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE',      (0, 1), (-1, -1), 8),
                ('TEXTCOLOR',     (0, 1), (-1, -1), C_GRAY_800),
                ('GRID',          (0, 0), (-1, -1), 0.4, C_GRAY_200),
                ('TOPPADDING',    (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('LEFTPADDING',   (0, 0), (-1, -1), 6),
                ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, C_GRAY_50]),
                ('FONTNAME',      (-1, 1), (-1, -1), 'Helvetica-Bold'),
            ]
            for i, lc in enumerate(layer_changes[:shown], start=1):
                bg = (colors.HexColor('#d1fae5') if lc['reduction_pct'] >= 40
                      else colors.HexColor('#fef3c7') if lc['reduction_pct'] >= 20
                      else colors.HexColor('#ede9fe'))
                lt_style.append(('BACKGROUND', (-1, i), (-1, i), bg))
            lt_style.append(('TEXTCOLOR', (-1, 1), (-1, -1), C_SUCCESS))
            layer_tbl = Table(layer_data, colWidths=[COL_N, COL_T, COL_B, COL_A, COL_P])
            layer_tbl.setStyle(TableStyle(lt_style))
            elements.append(layer_tbl)
        else:
            elements.append(Paragraph(
                "No layer structural changes detected. This can happen if the pruning "
                "ratio was very small or importance scores were uniform across all channels.",
                note_style,
            ))
        elements.append(Spacer(1, 10))

        # ================================================================ #
        # 7. SUMMARY TABLE
        # ================================================================ #
        elements.append(Paragraph("7. Summary", section_style))
        summary_rows = [["Metric", "Before", "After", "Change"]]
        for row in [
            ("Parameters",  fmt_num(orig_params),  fmt_num(prnd_params),  f"\u25bc {param_pct}%"),
            ("MACs",  fmt_macs(orig_macs),   fmt_macs(prnd_macs),   f"\u25bc {mac_pct}%"),
            ("FLOPs", fmt_flops(orig_flops), fmt_flops(prnd_flops), f"\u25bc {flop_pct}%"),
            ("File Size",   fmt_mb(orig_bytes),     fmt_mb(prnd_bytes),    f"\u25bc {size_pct}%"),
        ]:
            summary_rows.append(list(row))
        if before_ms > 0 and after_ms > 0:
            summary_rows.append(["Inference Latency",
                                  f"{before_ms:.2f} ms", f"{after_ms:.2f} ms",
                                  f"\u25bc {latency_red}%"])
        if before_thr > 0 and after_thr > 0:
            summary_rows.append(["Throughput",
                                  f"{before_thr:.1f} img/s", f"{after_thr:.1f} img/s",
                                  f"\u25b2 {thr_gain}%"])
        cw4 = CW / 4
        sum_tbl = Table(summary_rows, colWidths=[cw4 * 1.2, cw4 * 0.9, cw4 * 0.9, cw4 * 1.0])
        sum_tbl.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1,  0), C_PRIMARY),
            ('TEXTCOLOR',     (0, 0), (-1,  0), colors.white),
            ('FONTNAME',      (0, 0), (-1,  0), 'Helvetica-Bold'),
            ('FONTSIZE',      (0, 0), (-1,  0), 9.5),
            ('FONTNAME',      (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE',      (0, 1), (-1, -1), 9),
            ('GRID',          (0, 0), (-1, -1), 0.5, C_GRAY_200),
            ('TOPPADDING',    (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING',   (0, 0), (-1, -1), 10),
            ('ROWBACKGROUNDS',(0, 1), (-1, -1), [colors.white, C_GRAY_50]),
            ('TEXTCOLOR',     (-1, 1), (-1, -1), C_SUCCESS),
            ('FONTNAME',      (-1, 1), (-1, -1), 'Helvetica-Bold'),
        ]))
        elements.append(sum_tbl)

        # Footer
        elements.append(Spacer(1, 24))
        foot_div = Drawing(CW, 4)
        foot_div.add(Rect(0, 1, CW, 1, fillColor=C_GRAY_200, strokeColor=None))
        elements.append(foot_div)
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(
            f"Generated automatically by CleanAI+ \u00b7 "
            f"Optimization ID: {optimization.id} \u00b7 "
            f"{datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            note_style,
        ))

        doc.build(elements)

        report = Report(
            workspace_id=optimization.workspace_id,
            reference_id=optimization.id,
            reference_type=ReportType.OPTIMIZATION,
            name=f"Optimization Report: {model_name} \u2192 {output_name}",
            file_path=file_path,
            metadata={
                "model_name":         model_name,
                "output_model_name":  output_name,
                "param_reduction_pct": param_pct,
                "mac_reduction_pct":  mac_pct,
            },
        )
        await report.insert()
        return report
