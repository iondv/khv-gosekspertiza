package ion.doc2pdf;

import java.awt.Color;
import java.io.InputStream;
import java.io.OutputStream;

import org.apache.poi.xwpf.converter.pdf.PdfConverter;
import org.apache.poi.xwpf.converter.pdf.PdfOptions;
import org.apache.poi.xwpf.usermodel.XWPFDocument;

import com.lowagie.text.Font;
import com.lowagie.text.pdf.BaseFont;

import fr.opensagres.xdocreport.itext.extension.font.IFontProvider;

public class DocxToPdfConverter {

	private InputStream inStream;
	private OutputStream outStream;
	private String fontPath;
	
	public DocxToPdfConverter(InputStream inStream, OutputStream outStream, String fontPath) {
		this.inStream = inStream;
		this.outStream = outStream;
		this.fontPath = fontPath;
	}
	
	public void convert() throws Exception {
		
		PdfOptions pdfOptions = PdfOptions.create();
		pdfOptions.fontProvider(new IFontProvider() {
			
			public Font getFont(String familyName, String encoding, float size, int style, Color color) {

				Font f = null;
				BaseFont baseFont;
				try {
					baseFont = BaseFont.createFont(fontPath, encoding, BaseFont.EMBEDDED);
					f = new Font(baseFont, size, style, color);
				} catch (Exception e) {
					e.printStackTrace();
					f = null;
				}
				return f;
			    
			}

		});
		XWPFDocument document = new XWPFDocument(inStream);
		PdfConverter.getInstance().convert(document, outStream, pdfOptions);
	}
	
	
	
}
