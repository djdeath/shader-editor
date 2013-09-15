const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const Cogl = imports.gi.Cogl;
const GtkSource = imports.gi.GtkSource;
const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const Parser = imports.myglsl.myglsl;
const Nodes = imports.shaderNodes;
const Journal = imports.journal;
const LayerManager = imports.layerManager;
const Utils = imports.utils;


GtkClutter.init(null, null);

/* Fixups */
let languageManager = GtkSource.LanguageManager.get_default();

/* Utils */

let boxToString = function(box) {
    return "" + box.x1 + "x" + box.y1 + " -> " + box.x2 + "x" + box.y2;
};

/* Main setup */

let journal = new Journal.Journal();
journal.load();

let builder = new Gtk.Builder();
builder.add_from_file('shader-editor.ui');

let win = builder.get_object('window-main');
win.connect('destroy', Lang.bind(this, function() {
    journal.save();
    Gtk.main_quit();
}));

let textView = builder.get_object('fragment-text-view');
textView.set_buffer(new GtkSource.Buffer());
let textBuffer = textView.get_buffer();
textBuffer.set_language(languageManager.get_language('glsl'));

let parser = new Parser.Parser();

let embeddedStage = new GtkClutter.Embed();
builder.get_object('live-view-container').add(embeddedStage);
embeddedStage.show();

let stage = embeddedStage.get_stage();
stage.background_color = Clutter.Color.get_static(Clutter.StaticColor.BLACK);

let ctx = Clutter.get_default_backend().get_cogl_context();

win.show();

/* Pipeline setup */

const PipelineContent = new Lang.Class({
    Name: 'PipelineContent',
    Extends: GObject.Object,
    Implements: [ Clutter.Content, ],

    _init: function() {
        this.parent();
        this._backPipeline = new Cogl.Pipeline(ctx);
        this._backPipeline.set_layer_wrap_mode(0, Cogl.PipelineWrapMode.REPEAT);
        this._backPipeline.set_layer_wrap_mode(1, Cogl.PipelineWrapMode.REPEAT);
        this._frontPipeline = this._backPipeline;
    },

    vfunc_paint_content: function(actor, parent) {
        let node = new Clutter.PipelineNode(this._frontPipeline);
        let box = actor.get_allocation_box();
        node.add_rectangle(box);
        parent.add_child(node);
    },

    setLayerTexture: function(layer, filename) {
        log('set layer texture ' + layer + ' to ' + filename);
        this._backPipeline.set_layer_texture(layer,
                                             Cogl.Texture.new_from_file(filename,
                                                                        Cogl.TextureFlags.NO_ATLAS,
                                                                        Cogl.PixelFormat.ANY));
        this.emit('pipeline-updated');
    },

    setColor: function(color) {
        let _color = new Cogl.Color();
        _color.set_from_4f(color.red, color.green, color.blue, color.alpha);
        this._backPipeline.set_color(_color);
        this.emit('pipeline-updated');
    },

    getBackPipeline: function() {
        return this._backPipeline;
    },

    setFrontPipeline: function(pipeline) {
        this._frontPipeline = pipeline;
        this.invalidate();
    },

});
Signals.addSignalMethods(PipelineContent.prototype);

let pipelineContent = new PipelineContent();
stage.set_content(pipelineContent);

/* Color edition */
let colorButton = builder.get_object('color-button');
colorButton.connect('notify::rgba', Lang.bind(this, function(button) {
    pipelineContent.setColor(button.get_rgba());
}));
colorButton.set_rgba(colorButton.get_rgba());

/* Layer edition */
let layerManager = new LayerManager.LayerManager(builder, pipelineContent);


/* Error highlight */

let cleanErrorFromBuffer = function(buffer) {
    let tagTable = buffer.get_tag_table();
    let tag = tagTable.lookup('error');
    if (tag)
        tagTable.remove(tag);
};

let showErrorOnBuffer = function(buffer, location, color) {
    log('error at  ' + location.first_line + ':' + location.first_column);

    let tag = new Gtk.TextTag({
        name: 'error',
        background: color != null ? color : 'red',
    });
    buffer.get_tag_table().add(tag);

    let endIter = buffer.get_iter_at_line(location.first_line);
    endIter.forward_line();
    log(location.first_line);
    log('looking for start at : ' + location.first_column >= endIter.get_line_index() ?
        Math.max(location.first_column - 1, 0) : location.first_column);
    let startIter = buffer.get_iter_at_line_index(location.first_line,
                                                  location.first_column >= endIter.get_line_index() ?
                                                  Math.max(location.first_column - 1, 0) : location.first_column);
    if (location.last_line > 0) {
        log('looking for end at : ' + location.last_column);
        endIter = buffer.get_iter_at_line_index(location.last_line,
                                                location.last_column);
    } else {
        endIter = startIter.copy();
        endIter.forward_line();
    }
    buffer.apply_tag_by_name('error', startIter, endIter);
};

/**/


/*
gtk_text_view_get_iter_location     (GtkTextView *text_view,
                                                         const GtkTextIter *iter,
                                                         GdkRectangle *location);
*/


/* Replay buttons */

let playbackButton = builder.get_object('playback-button');
let playforwardButton = builder.get_object('playforward-button');

let updateReplayButtons = function(method) {
    if (method) {
        journal.suspendRecord();
        textBuffer.set_text(journal[method](), -1);
        journal.unsuspendRecord();
    }
    playbackButton.set_sensitive(journal.canPrevious());
    playforwardButton.set_sensitive(journal.canNext());
};

playbackButton.connect('clicked', Lang.bind(this, function() {
    updateReplayButtons('getPreviousState');
}));
playforwardButton.connect('clicked', Lang.bind(this, function() {
    updateReplayButtons('getNextState');
}));

updateReplayButtons();

/* Parser handling */
let currentFragmentShader = '';

let updatePipelineShader = function() {
    if (currentFragmentShader.length > 0) {
        let newPipeline = pipelineContent.getBackPipeline().copy();
        newPipeline.add_snippet(new Cogl.Snippet(Cogl.SnippetHook.FRAGMENT, '', currentFragmentShader));
        pipelineContent.setFrontPipeline(newPipeline);
    } else {
        pipelineContent.setFrontPipeline(pipelineContent.getBackPipeline());
    }
};

pipelineContent.connect('pipeline-updated', Lang.bind(this, function() {
    updatePipelineShader();
}));

textBuffer.connect('insert-text', Lang.bind(this, function(buf, location, text, len) {
    journal.insertText(location.get_offset(), text);
}));
textBuffer.connect('delete-range', Lang.bind(this, function(buf, start, end) {
    let text = textBuffer.get_text(start, end, false);
    journal.deleteText(start.get_offset(), text);
}));

textBuffer.connect('changed', Lang.bind(this, function() {
    let str = textBuffer.get_text(textBuffer.get_start_iter(),
                              textBuffer.get_end_iter(),
                              false);

    if (str.length < 1)
        return;

    cleanErrorFromBuffer(textBuffer);
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
        currentFragmentShader = str;
        updatePipelineShader();
    } catch (ex if ex.name === 'ParsingError') {
        log('parse failed on : ' + str);
        log(ex);
        log(ex.stack);
        showErrorOnBuffer(textBuffer, ex.location, '#f8855d');
    } catch (ex if ex.name === 'SymbolError') {
        log('parse failed on : ' + str);
        log(ex);
        log(ex.stack);
        showErrorOnBuffer(textBuffer, ex.location, '#afc948');
    }

    updateReplayButtons();
}));

journal.suspendRecord();
textBuffer.set_text(journal.getLastState(), -1);
journal.unsuspendRecord();

/* Inspection and elements highlight */

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

    // textView.set_tooltip_text(null);
    // textView.set_tooltip_text(element.getDescription());

    _currentHighlighted = element;
};

let hasHighlight = function(buffer) {
    return _currentHighlighted != null;
};

let getHighlighted = function() {
    return _currentHighlighted;
};

let showElementHighlightAt = function(x, y) {
    if (parser.yy.literals == null ||
        parser.yy.literals.length < 1)
        return;

    log(x + 'x' + y);
    x += textView.get_hadjustment().get_value();
    y += textView.get_vadjustment().get_value();
    let iter = textView.get_iter_at_location(x, y);

    for (let i in parser.yy.variables) {
        let v = parser.yy.variables[i];

        if (v.containsPosition(iter.get_line(), iter.get_line_offset())) {
            highlightElementOnBuffer(textBuffer, v);
            log('found variable : ' + v.name);
            return false;
        }
    }
    for (let i in parser.yy.functions) {
        let f = parser.yy.functions[i];

        if (f.containsPosition(iter.get_line(), iter.get_line_offset())) {
            highlightElementOnBuffer(textBuffer, f);
            log('found function : ' + f.name);
            return false;
        }
    }
    for (let i in parser.yy.literals) {
        let l = parser.yy.literals[i];

        if (l.containsPosition(iter.get_line(), iter.get_line_offset())) {
            highlightElementOnBuffer(textBuffer, l);
            log('found literal : ' + l.value);
            return false;
        }
    }
};

textView.connect('key-press-event', Lang.bind(this, function(widget, event) {
    if (event.get_keyval()[1] == Gdk.KEY_Control_L) {
        let win = textView.get_window(Gtk.TextWindowType.WIDGET);
        let [, x, y, mask] = win.get_device_position(Utils.getMouse());

        showElementHighlightAt(x, y);
    }
    return false;
}));
textView.connect('key-release-event', Lang.bind(this, function(widget, event) {
    if (event.get_keyval()[1] == Gdk.KEY_Control_L)
        cleanHighlightFromBuffer(textBuffer);
    return false;
}));
textView.connect('motion-notify-event', Lang.bind(this, function(widget, event) {
    if ((event.get_state()[1] & Gdk.ModifierType.CONTROL_MASK) != 0) {
        let [, x, y] = event.get_coords();
        showElementHighlightAt(x, y);
        return false;
    }
    cleanHighlightFromBuffer(textBuffer);

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


let modifierScale = builder.get_object('modifier-scale');

let _leaveTimeout = 0;
let cancelLeaveTimeout = function(modifier) {
    if (_leaveTimeout != 0) {
        Mainloop.source_remove(_leaveTimeout);
        _leaveTimeout = 0;
    }
};
let startLeaveTimeout = function(modifier) {
    _leaveTimeout = Mainloop.timeout_add(500, Lang.bind(this, function() {
        _currentStartOffset = -1;
        _currentEndOffset = -1;
        _leaveTimeout = 0;
        modifier.hide();
        return false;
    }));
};


let initModifier = function(modifier) {
    modifier.connect('enter-notify-event', Lang.bind(this, function(widget, event) {
        if (event.get_window() != modifier.get_window())
            return false;

        cancelLeaveTimeout(modifier);
        return false;
    }));
    modifier.connect('leave-notify-event', Lang.bind(this, function(widget, event) {
        if (event.get_window() != modifier.get_window())
            return false;

        cancelLeaveTimeout(modifier);
        startLeaveTimeout(modifier);
        return false;
    }));
};
initModifier(builder.get_object('value-modifier'));
initModifier(builder.get_object('picture-modifier'));


textView.connect('button-release-event', Lang.bind(this, function(widget, event) {
    if (event.get_button()[1] == 1 &&
        textView.get_modifier_mask(0) == Gdk.ModifierType.CONTROL_MASK) {
        let element = getHighlighted();
        if (element) {
            if (element.isLiteral()) {
                let modifier = builder.get_object('value-modifier');
                let value = element.value;
                let bounds = getSmartBounds(element.value);
                modifierScale.set_range(bounds[0], bounds[1]);
                modifierScale.set_value(element.value);
                modifier.present();
            } else if (element.isBuiltin()) {
                let pixbuf = layerManager.getPixbuf(element.name);
                if (pixbuf) {
                    let modifier = builder.get_object('picture-modifier');
                    builder.get_object('picture-modifier-image').set_from_pixbuf(pixbuf);
                    modifier.present();
                }
            }
        }
        return false;
    }
    return false;
}));

let _currentStartOffset = -1;
let _currentEndOffset = -1;
modifierScale.connect('value-changed', Lang.bind(this, function(widget) {
    let element = getHighlighted();
    let location = element.location;
    let start = textBuffer.get_iter_at_line_index(location.first_line, location.first_column);
    if (_currentStartOffset < 0) {
        let end = textBuffer.get_iter_at_line_index(location.last_line, location.last_column);
        _currentStartOffset = start.get_offset(start);
        _currentEndOffset = end.get_offset(end);
    }

    let end = textBuffer.get_iter_at_offset(_currentEndOffset);
    textBuffer.delete(start, end);

    let newBitTxt = '' + modifierScale.get_value();
    textBuffer.insert(start, newBitTxt, -1);


    // let txt = textBuffer.get_text(textBuffer.get_start_iter(), textBuffer.get_end_iter(), false);
    // let newTxt = txt.slice(0, _currentStartOffset) + modifierScale.get_value() + txt.slice(_currentEndOffset);
    // textBuffer.set_text(newTxt, -1);

    _currentEndOffset = _currentStartOffset + newBitTxt.length;
}));

/**/

Gtk.main();
