import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
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
            priority = ["accuracy", "top5_accuracy", "loss", "precision", "recall", "f1_score"]
            items = [
                x for x in execution.metrics.items() 
                if x[0] != "processed_samples"
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
