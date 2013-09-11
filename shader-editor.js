const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const Cogl = imports.gi.Cogl;
const Lang = imports.lang;
const Signals = imports.signals;

const Parser = imports.myglsl.myglsl;
const Nodes = imports.shaderNodes;

/* Utils */

let boxToString = function(box) {
    return "" + box.x1 + "x" + box.y1 + " -> " + box.x2 + "x" + box.y2;
};


/* Main setup */

GtkClutter.init(null, null);

let builder = new Gtk.Builder();
builder.add_from_file('shader-editor.ui');

let win = builder.get_object('window-main');
win.connect('destroy', Lang.bind(this, function() {
    Gtk.main_quit();
}));


let create = builder.get_object('button-create');

let parser = new Parser.Parser();

let embeddedStage = new GtkClutter.Embed();
builder.get_object('live-view-container').add(embeddedStage);

let stage = embeddedStage.get_stage();
stage.background_color = Clutter.Color.get_static(Clutter.StaticColor.BLACK);

let ctx = Clutter.get_default_backend().get_cogl_context();
let texture = Cogl.Texture.new_from_file(ARGV[0],
                                         Cogl.TextureFlags.NO_ATLAS,
                                         Cogl.PixelFormat.ANY);

let pipeline = new Cogl.Pipeline(ctx);
pipeline.set_layer_texture(0, texture);
pipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.REPEAT);

const PipelineContent = new Lang.Class({
    Name: 'PipelineContent',
    Extends: GObject.Object,
    Implements: [ Clutter.Content, ],

    init: function() {
    },

    vfunc_paint_content: function(actor, parent) {
        let node = new Clutter.PipelineNode(this.pipeline);
        let box = actor.get_allocation_box();
        node.add_rectangle(box);
        parent.add_child(node);
    },

});


let pipelineContent = new PipelineContent();
pipelineContent.pipeline = pipeline;
stage.set_content(pipelineContent);

win.show_all();

/* Error highlight */

let cleanErrorFromBuffer = function(buffer) {
    let tagTable = buffer.get_tag_table();
    let tag = tagTable.lookup('error');
    if (tag)
        tagTable.remove(tag);
};

let showErrorAtLineOnBuffer = function(buffer, line) {
    log('error at line ' + line);

    let tag = new Gtk.TextTag({
        name: 'error',
        background: 'red',
    });
    buffer.get_tag_table().add(tag);

    let startIter = buffer.get_iter_at_line(line);
    let endIter = startIter.copy();
    endIter.forward_line();
    buffer.apply_tag_by_name('error', startIter, endIter);
};

/* Elements highlight */

let _currentHighlighted = null;

let cleanHighlightFromBuffer = function(buffer) {
    let tagTable = buffer.get_tag_table();
    let tag = tagTable.lookup('highlight');
    if (tag)
        tagTable.remove(tag);
    _currentHighlighted = null;
};

let highlightElementOnBuffer = function(buffer, element) {
    let tagTable = buffer.get_tag_table();

    if (_currentHighlighted == element)
        return;
    else
        cleanHighlightFromBuffer(buffer);

    let addTag = function(location) {
        let startIter = buffer.get_iter_at_line_offset (location.first_line,
                                                        location.first_column);
        let endIter = buffer.get_iter_at_line_offset (location.last_line,
                                                      location.last_column);

        if (!tagTable.lookup('highlight')) {
            let tag = new Gtk.TextTag({
                name: 'highlight',
                background: 'lightblue',
            });
            tagTable.add(tag);
        }

        buffer.apply_tag_by_name('highlight', startIter, endIter);
    };

    addTag(element.location);
    for (let i in element.references)
        addTag(element.references[i]);

    _currentHighlighted = element;
};

let hasHighlight = function(buffer) {
    return _currentHighlighted != null;
};

let getHighlighted = function() {
    return _currentHighlighted;
};

/**/


/*
gtk_text_view_get_iter_location     (GtkTextView *text_view,
                                                         const GtkTextIter *iter,
                                                         GdkRectangle *location);
*/


/* Parser handling */

let buffer = builder.get_object('text-buffer');
let labelResult = builder.get_object('label-result');

buffer.connect('changed', Lang.bind(this, function() {
    let str = buffer.get_text(buffer.get_start_iter(),
                              buffer.get_end_iter(),
                              false);

    if (str.length < 1)
        return;

    cleanErrorFromBuffer(buffer);
    try {
        parser.yy = new Nodes.Nodes();
        parser.parse(str);
        // log('variables : ');
        // for (let i in parser.yy.variables) {
        //     let v = parser.yy.variables[i];
        //     log('           ' + v.name + '@(' + v.location.first_line + ',' + v.location.first_column + ')');
        // }
        // log('functions : ');
        // for (let i in parser.yy.functions) {
        //     let v = parser.yy.functions[i];
        //     log('           ' + v.name + '@(' + v.location.first_line + ',' + v.location.first_column + ')');
        // }
        // log('literals : ');
        // for (let i in parser.yy.literals) {
        //     let v = parser.yy.literals[i];
        //     log('           ' + v.value + '@(' + v.location.first_line + ',' + v.location.first_column + ')');
        // }

        /* Setup the new pipeline */
        let newPipeline = pipeline.copy();
        newPipeline.add_snippet(new Cogl.Snippet(Cogl.SnippetHook.FRAGMENT,
                                                 '',
                                                 str));
        let content = stage.content;
        content.pipeline = newPipeline;
        content.invalidate();
    } catch (ex) {
        log('parse failed on : ' + str);
        log(ex);
        log(ex.name);
        log(ex.stack);
        showErrorAtLineOnBuffer(buffer, ex.line);
    }
}));

/* Inspection handling */

let textView = builder.get_object('fragment-text-view');
textView.connect('motion-notify-event',
                 Lang.bind(this, function(widget, event) {
                     if ((event.get_state()[1] & Gdk.ModifierType.CONTROL_MASK) != 0 &&
                         parser.yy.literals &&
                         parser.yy.literals.length > 0) {
                         let [, x, y] = event.get_coords();
                         //log(x + 'x' + y);
                         let iter = textView.get_iter_at_location(x, y);

                         for (let i in parser.yy.variables) {
                             let v = parser.yy.variables[i];

                             if (v.containsPosition(iter.get_line(), iter.get_line_offset())) {
                                 highlightElementOnBuffer(buffer, v);
                                 log('found variable : ' + v.name);
                                 return false;
                             }
                         }
                         for (let i in parser.yy.functions) {
                             let f = parser.yy.functions[i];

                             if (f.containsPosition(iter.get_line(), iter.get_line_offset())) {
                                 highlightElementOnBuffer(buffer, f);
                                 log('found function : ' + f.name);
                                 return false;
                             }
                         }
                         for (let i in parser.yy.literals) {
                             let l = parser.yy.literals[i];

                             if (l.containsPosition(iter.get_line(), iter.get_line_offset())) {
                                 highlightElementOnBuffer(buffer, l);
                                 log('found literal : ' + l.value);
                                 return false;
                             }
                         }
                     }
                     cleanHighlightFromBuffer(buffer);

                     return false;
                 }));

/* Contextual modifier setup */

let getSmartBounds = function(value) {
    if (value < 1.0)
        return [0.0, 1.0];
    else if (value < 10.0)
        return [0.0, 10.0];
    else if (value < 100.0)
        return [0.0, 100.0];
    return [0.0, 1.0];
};


let modifier = builder.get_object('modifier');
let modifierScale = builder.get_object('modifier-scale');

textView.connect('button-release-event', Lang.bind(this, function(widget, event) {
    log('button press : ' + event.get_button()[1]);
    log('modifier state : ' +  textView.get_modifier_mask(0));
    if (event.get_button()[1] == 1 &&
        textView.get_modifier_mask(0) == Gdk.ModifierType.CONTROL_MASK) {
        let element = getHighlighted();
        if (element && element.isLiteral()) {
            let value = element.value;
            let bounds = getSmartBounds(element.value);
            modifierScale.set_range(bounds[0], bounds[1]);
            modifierScale.set_value(element.value);
            modifier.show();
        }
        return false;
    }
    return false;
}));

let _currentStartOffset = -1;
let _currentEndOffset = -1;
modifierScale.connect('value-changed', Lang.bind(this, function(widget) {
    if (_currentStartOffset < 0) {
        let element = getHighlighted();
        let location = element.location;
        let start = buffer.get_iter_at_line_index(location.first_line, location.first_column);
        let end = buffer.get_iter_at_line_index(location.last_line, location.last_column);
        _currentStartOffset = start.get_offset(start);
        _currentEndOffset = end.get_offset(end);
    }

    let txt = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
    let newBitTxt = '' + modifierScale.get_value();
    let newTxt = txt.slice(0, _currentStartOffset) + modifierScale.get_value() + txt.slice(_currentEndOffset);
    buffer.set_text(newTxt, -1);

    _currentEndOffset = _currentStartOffset + newBitTxt.length;
}));

modifier.connect('enter-notify-event', Lang.bind(this, function(widget, event) {
    log('enter popup window : ' + event.get_window() + ' - ' + modifier.get_window());
    return false;
}));
modifier.connect('leave-notify-event', Lang.bind(this, function(widget, event) {
    log('leave popup window : ' + event.get_window() + ' - ' + modifier.get_window());
    if (event.get_window() == modifier.get_window()) {
        _currentStartOffset = -1;
        _currentEndOffset = -1;
        modifier.hide();
    }
    return false;
}));

/**/

Gtk.main();
