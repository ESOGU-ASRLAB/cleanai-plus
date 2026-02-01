import os
from datetime import datetime
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String
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
        # Drawing a simple logo: Blue Rounded Rect with partial text
        d = Drawing(400, 50)
        # Gradient effect (simulated with solid color for simplicity in PDF)
        d.add(Rect(0, 10, 32, 32, rx=8, ry=8, fillColor=colors.HexColor('#2563eb'), strokeColor=None))
        # Icon inside (Simple 'C' or Check)
        d.add(String(8, 18, "C", fontName="Helvetica-Bold", fontSize=20, fillColor=colors.white))
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
        resource_data = [
            ["AI Model", model_name],
            ["Dataset", dataset_name],
            ["Preprocessing Pipeline", preprocessing_name],
        ]
        
        # Add Preprocessing Steps or Code
        if preprocessing_code:
            # Escape HTML characters and formatting for code block
            # Note: Paragraph doesn't support <pre>, so we use <font face=Courier> and replace newlines/spaces
            safe_code = preprocessing_code.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            safe_code = safe_code.replace("\n", "<br/>").replace(" ", "&nbsp;")
            
            code_content = f"""<font name="Courier" size="9">{safe_code}</font>"""
            resource_data.append(["Pipeline Code", Paragraph(code_content, styles['Normal'])])
            
        elif preprocessing_steps:
             steps_content = "<br/>".join([f"&bull; {step}" for step in preprocessing_steps])
             resource_data.append(["Pipeline Steps", Paragraph(steps_content, styles['Normal'])])
        else:
             resource_data.append(["Pipeline Steps", "No custom steps."])

        # Append Config keys to this table to make it cleaner
        for k, v in execution.config.items():
             resource_data.append([f"Config: {k}", str(v)])
             
        elements.append(create_modern_table(resource_data, colWidths=[150, 350]))

        elements.append(Spacer(1, 15))

        # 3. Results & Metrics
        elements.append(Paragraph("3. Performance Results", section_style))
        if execution.metrics:
            metrics_data = [
                [k.replace("_", " ").title(), str(v)] 
                for k, v in execution.metrics.items()
            ]
        else:
            metrics_data = [["Status", "No metrics available yet."]]

        # different style for metrics to make it pop
        t_metrics = Table(metrics_data, colWidths=[150, 350])
        t_metrics.setStyle(TableStyle([
             ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#eff6ff')), # Light blue bg for keys
             ('TEXTCOLOR', (0, 0), (0, -1), primary_color),
             ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
             ('FONTSIZE', (0, 0), (-1, -1), 11),
             ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
             ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
             ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
             ('TOPPADDING', (0, 0), (-1, -1), 12),
             ('GRID', (0, 0), (-1, -1), 1, colors.white), # White borders for clean look
             ('LINEBELOW', (0, 0), (-1, -1), 2, colors.white),
        ]))
        elements.append(t_metrics)
        
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
