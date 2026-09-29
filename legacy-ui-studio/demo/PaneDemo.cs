using System;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Automation.Peers;
using System.Windows.Threading;

public class LegacyField : TextBox {
    protected override AutomationPeer OnCreateAutomationPeer() { return new FieldPeer(this); }
}
public class FieldPeer : TextBoxAutomationPeer {
    public FieldPeer(LegacyField owner) : base(owner) { }
    protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Pane; }
    protected override string GetAutomationIdCore() { return ""; }
    protected override string GetNameCore() { return ""; }
    protected override string GetClassNameCore() { return "LegacyField"; }
}
public class LegacyCommand : Button {
    protected override AutomationPeer OnCreateAutomationPeer() { return new CommandPeer(this); }
}
public class CommandPeer : ButtonAutomationPeer {
    public CommandPeer(LegacyCommand owner) : base(owner) { }
    protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Pane; }
    protected override string GetAutomationIdCore() { return ""; }
    protected override string GetNameCore() { return ""; }
    protected override string GetClassNameCore() { return "LegacyCommand"; }
}
public class LegacyForm : StackPanel {
    protected override AutomationPeer OnCreateAutomationPeer() { return new FormPeer(this); }
}
public class FormPeer : FrameworkElementAutomationPeer {
    public FormPeer(LegacyForm owner) : base(owner) { }
    protected override AutomationControlType GetAutomationControlTypeCore() { return AutomationControlType.Pane; }
    protected override string GetAutomationIdCore() { return ""; }
    protected override string GetNameCore() { return "Customer form"; }
    protected override string GetClassNameCore() { return "LegacyForm"; }
    protected override bool IsControlElementCore() { return true; }
}
public class PaneDemo : Window {
    LegacyField code, customer;
    LegacyForm form;
    TextBlock result, phase, footer;
    TextBox inspector;
    string folder, previousStage = "", previousTrace = "", previousCommand = "";
    int saves = 0;
    Brush ink = new SolidColorBrush(Color.FromRgb(27, 43, 65));
    Brush muted = new SolidColorBrush(Color.FromRgb(99, 116, 139));
    public PaneDemo(string output) {
        folder = output;
        Directory.CreateDirectory(folder);
        Title = "Legacy Pane Lab";
        Width = 1180; Height = 750; Left = 30; Top = 30;
        ResizeMode = ResizeMode.CanMinimize;
        Background = new SolidColorBrush(Color.FromRgb(241,245,250));
        FontFamily = new FontFamily("Segoe UI");
        var root = new Grid(); Content = root;
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(115) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(55) });
        var header = new StackPanel { Background = new SolidColorBrush(Color.FromRgb(20,35,58)), Margin = new Thickness(0) };
        header.Children.Add(new TextBlock { Text = "LEGACY PANE LAB  /  LIVE WINDOWS UIA", Foreground = Brushes.LightSteelBlue, FontSize = 13, Margin = new Thickness(28,18,0,4) });
        phase = new TextBlock { Text = "Ready for inspection", Foreground = Brushes.White, FontSize = 26, FontWeight = FontWeights.SemiBold, Margin = new Thickness(28,0,0,0) };
        header.Children.Add(phase); root.Children.Add(header);
        var body = new Grid { Margin = new Thickness(24) }; Grid.SetRow(body, 1); root.Children.Add(body);
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(430) });
        body.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var left = new StackPanel { Margin = new Thickness(0,0,24,0) }; body.Children.Add(left);
        left.Children.Add(Label("CUSTOMER FORM", 18, true));
        left.Children.Add(Label("One parent / four direct children", 14, false));
        var fields = new Grid { Margin = new Thickness(0,22,0,0) };
        fields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(82) });
        fields.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        var captions = new StackPanel();
        foreach (string label in new string[] { "Code", "Name", "Save", "Reset" }) {
            captions.Children.Add(new TextBlock { Text = label, Foreground = muted, Height = 64, Padding = new Thickness(0,15,0,0), FontSize = 15 });
        }
        fields.Children.Add(captions);
        form = new LegacyForm(); Grid.SetColumn(form, 1); fields.Children.Add(form);
        code = new LegacyField(); customer = new LegacyField();
        foreach (var input in new LegacyField[] { code, customer }) {
            input.Height = 48; input.Margin = new Thickness(0,0,0,16); input.Padding = new Thickness(12,10,8,8);
            input.FontSize = 17; input.Foreground = ink; input.BorderBrush = Brushes.LightSteelBlue;
            form.Children.Add(input);
        }
        var save = new LegacyCommand { Content = "Save record", Background = new SolidColorBrush(Color.FromRgb(30,93,214)), Foreground = Brushes.White };
        var reset = new LegacyCommand { Content = "Clear form", Background = Brushes.White, Foreground = ink };
        foreach (var button in new LegacyCommand[] { save, reset }) {
            button.Height = 48; button.Margin = new Thickness(0,0,0,16); button.FontSize = 16;
            button.BorderBrush = Brushes.LightSteelBlue; form.Children.Add(button);
        }
        save.Click += delegate { saves++; result.Text = "SAVED #" + saves + " | " + code.Text + " | " + customer.Text; };
        reset.Click += delegate { code.Text = ""; customer.Text = ""; result.Text = "CLEARED | both inputs empty"; };
        left.Children.Add(fields);
        left.Children.Add(Label("APPLICATION RESULT", 12, true));
        result = Label("No record saved", 15, false); result.TextWrapping = TextWrapping.Wrap;
        System.Windows.Automation.AutomationProperties.SetAutomationId(result, "result");
        left.Children.Add(result);
        left.Children.Add(Label("All 4 controls: Pane / AutomationId = empty\nInputs: ValuePattern / Buttons: InvokePattern", 12, false));
        var right = new Grid(); Grid.SetColumn(right, 1); body.Children.Add(right);
        right.RowDefinitions.Add(new RowDefinition { Height = new GridLength(34) });
        right.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        right.Children.Add(Label("INSPECTOR / REAL ENGINE OUTPUT", 16, true));
        inspector = new TextBox { IsReadOnly = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
            Background = new SolidColorBrush(Color.FromRgb(15,25,43)), Foreground = new SolidColorBrush(Color.FromRgb(164,232,214)),
            FontFamily = new FontFamily("Consolas"), FontSize = 14, Padding = new Thickness(18), BorderThickness = new Thickness(0) };
        Grid.SetRow(inspector, 1); right.Children.Add(inspector);
        footer = Label("LOCAL TEST APP  |  Synthetic data only  |  No business-system connection", 12, false);
        footer.Margin = new Thickness(28,12,0,0); Grid.SetRow(footer, 2); root.Children.Add(footer);
        var timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(150) };
        timer.Tick += delegate { Poll(); }; timer.Start();
    }
    TextBlock Label(string text, double size, bool bold) {
        return new TextBlock { Text = text, FontSize = size, Foreground = bold ? ink : muted,
            FontWeight = bold ? FontWeights.SemiBold : FontWeights.Normal, Margin = new Thickness(0,0,0,9), TextWrapping = TextWrapping.Wrap };
    }
    string Read(string file) { try { return File.ReadAllText(Path.Combine(folder,file)); } catch { return ""; } }
    void Poll() {
        var s = Read("stage.txt"); if (s != previousStage && s != "") { phase.Text = s; previousStage = s; }
        var t = Read("trace.txt"); if (t != previousTrace) { inspector.Text = t; previousTrace = t; }
        var c = Read("command.txt");
        if (c != previousCommand && c != "") {
            previousCommand = c;
            if (c.StartsWith("insert")) { form.Children.Insert(0, new LegacyField { Height = 38, Text = "Inserted sibling" }); }
        }
    }
    [STAThread]
    public static void Main(string[] args) {
        var app = new Application();
        app.Run(new PaneDemo(args.Length > 0 ? args[0] : Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"session")));
    }
}
