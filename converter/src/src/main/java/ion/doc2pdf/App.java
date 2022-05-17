package ion.doc2pdf;

import org.kohsuke.args4j.CmdLineException;
import org.kohsuke.args4j.CmdLineParser;
import org.kohsuke.args4j.Option;

public class App 
{
    public static void main( String[] args )
    {
    	try {
    		CommandLineValues values = new CommandLineValues();
    		CmdLineParser parser = new CmdLineParser(values);
    		try {
    			parser.parseArgument(args);
    		} catch (CmdLineException e) {
    			System.err.println(e.getMessage());
    			parser.printUsage(System.err);
    			return;
    		}
    		System.out.println(values.font);
			DocxToPdfConverter converter = new DocxToPdfConverter(System.in, System.out, values.font);
			converter.convert();
		} catch (Exception e) {
			e.printStackTrace();
		}
    }
    
    public static class CommandLineValues {
    	@Option(name = "-font", aliases = {"-f"}, required = true,  metaVar = "<font>",
    			usage = "Specifies a path for the ttf font file.")
    	public String font = null;
    }
}
