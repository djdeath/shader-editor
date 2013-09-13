const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Clutter = imports.gi.Clutter;
const GtkClutter = imports.gi.GtkClutter;
const Cogl = imports.gi.Cogl;
const Lang = imports.lang;
const Signals = imports.signals;

const Parser = imports.myglsl.myglsl;
const Nodes = imports.shaderNodes;
const Journal = imports.journal;

/* Utils */

let boxToString = function(box) {
    return "" + box.x1 + "x" + box.y1 + " -> " + box.x2 + "x" + box.y2;
};

/* Main setup */

let journal = new Journal.Journal();

GtkClutter.init(null, null);

let builder = new Gtk.Builder();
builder.add_from_file('shader-editor.ui');

let win = builder.get_object('window-main');
win.connect('destroy', Lang.bind(this, function() {
    journal.save();
    Gtk.main_quit();
}));


let create = builder.get_object('button-create');

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

/* Layers edition */

let initializeLayers = function() {
    let layersTreeView = builder.get_object('layers-treeview');
    let layersStore = builder.get_object('layers-store');

    let column = new Gtk.TreeViewColumn({ title: 'Name', });
    let renderer = new Gtk.CellRendererText();
    column.pack_start(renderer, true);
    column.add_attribute(renderer, 'text', 2);
    layersTreeView.append_column(column);

    column = new Gtk.TreeViewColumn({ title: 'Picture', });
    renderer = new Gtk.CellRendererPixbuf();
    column.pack_start(renderer, false);
    column.add_attribute(renderer, 'pixbuf', 0);
    layersTreeView.append_column(column);

    let layerChooser = builder.get_object('layer-filechooser-dialog');
    let thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.NORMAL);
    layerChooser.connect('update-preview', Lang.bind(this, function() {
        log(layerChooser.preview_widget.width_request);
        let file = layerChooser.get_file();
        if (file) {
            let pixbuf = thumbnailFactory.generate_thumbnail(file.get_uri(), "image/");
            layerChooser.preview_widget.set_from_pixbuf(pixbuf);
        }
    }));

    layerChooser.connect('response', Lang.bind(this, function(dialog, response) {
        if (response != Gtk.ResponseType.OK) {
            layerChooser.hide();
            return;
        }

        let file = layerChooser.get_file();
        if (file) {
            let iter = layersStore.append();
            let path = layersStore.get_path(iter);
            let layerId = path.get_indices()[0];
            layersStore.set(iter, [0, 1, 2],
                            [layerChooser.preview_widget.pixbuf, file.get_uri(), 'layer' + layerId]);
            pipelineContent.setLayerTexture(layerId, file.get_path());
        }

        layerChooser.hide();
    }));

    builder.get_object('add-layer-button')
        .connect('clicked', Lang.bind(this, function() {
            layerChooser.show();
        }));
};
initializeLayers();

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
    let startIter = buffer.get_iter_at_line_index(location.first_line,
                                                  location.first_column >= endIter.get_line_offset() ?
                                                  Math.max(location.first_column - 1, 0) : location.first_column);
    if (location.last_line > 0) {
        endIter = buffer.get_iter_at_line_index(location.last_line,
                                                location.last_column);
    } else {
        endIter = startIter.copy();
        endIter.forward_line();
    }
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

buffer.connect('insert-text', Lang.bind(this, function(buf, location, text, len) {
    journal.insertText(location.get_offset(), text);
}));
buffer.connect('delete-range', Lang.bind(this, function(buf, start, end) {
    let text = buffer.get_text(start, end, false);
    journal.deleteText(start.get_offset(), text);
}));

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
        currentFragmentShader = str;
        updatePipelineShader();
    } catch (ex if ex.name === 'ParsingError') {
        log('parse failed on : ' + str);
        log(ex);
        log(ex.stack);
        showErrorOnBuffer(buffer, ex.location, '#f8855d');
    } catch (ex if ex.name === 'SymbolError') {
        log('parse failed on : ' + str);
        log(ex);
        log(ex.stack);
        showErrorOnBuffer(buffer, ex.location, '#afc948');
    }
}));

journal.suspendRecord();
buffer.set_text(journal.getLastState(), -1);
journal.unsuspendRecord();

/* Replay buttons */

let playbackButton = builder.get_object('playback-button');
let playforwardButton = builder.get_object('playforward-button');

let updateReplayButtons = function(method) {
    if (method) {
        journal.suspendRecord();
        buffer.set_text(journal[method](), -1);
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



/* Inspection handling */

let textView = builder.get_object('fragment-text-view');
textView.connect('', Lang.bind(this, function(widget, event) {

}));
textView.connect('motion-notify-event', Lang.bind(this, function(widget, event) {
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
    let element = getHighlighted();
    let location = element.location;
    let start = buffer.get_iter_at_line_index(location.first_line, location.first_column);
    if (_currentStartOffset < 0) {
        let end = buffer.get_iter_at_line_index(location.last_line, location.last_column);
        _currentStartOffset = start.get_offset(start);
        _currentEndOffset = end.get_offset(end);
    }

    let end = buffer.get_iter_at_offset(_currentEndOffset);
    buffer.delete(start, end);

    let newBitTxt = '' + modifierScale.get_value();
    buffer.insert(start, newBitTxt, -1);


    // let txt = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
    // let newTxt = txt.slice(0, _currentStartOffset) + modifierScale.get_value() + txt.slice(_currentEndOffset);
    // buffer.set_text(newTxt, -1);

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
