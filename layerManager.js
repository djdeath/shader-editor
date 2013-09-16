const Gtk = imports.gi.Gtk;
const GnomeDesktop = imports.gi.GnomeDesktop;
const Lang = imports.lang;

/* Layers edition */
const LayerManager = function(builder, pipelineContent) {
    let _this = this;

    this.pipelineContent = pipelineContent;
    this.layersTreeView = builder.get_object('layers-treeview');
    this.layersStore = builder.get_object('layers-store');

    // let column = new Gtk.TreeViewColumn({ title: 'Name', });
    // let renderer = new Gtk.CellRendererText();
    // column.pack_start(renderer, true);
    // column.add_attribute(renderer, 'text', 2);
    // layersTreeView.append_column(column);

    let column = new Gtk.TreeViewColumn({ title: 'Picture', });
    let renderer = new Gtk.CellRendererPixbuf();
    column.pack_start(renderer, false);
    column.add_attribute(renderer, 'pixbuf', 0);
    this.layersTreeView.append_column(column);

    this.layerChooser = builder.get_object('layer-filechooser-dialog');
    this.thumbnailFactory = GnomeDesktop.DesktopThumbnailFactory.new(GnomeDesktop.DesktopThumbnailSize.NORMAL);
    this.layerChooser.connect('update-preview', Lang.bind(this, function() {
        let file = _this.layerChooser.get_file();
        if (file) {
            let pixbuf = _this.thumbnailFactory.generate_thumbnail(file.get_uri(), "image/");
            _this.layerChooser.preview_widget.set_from_pixbuf(pixbuf);
        }
    }));

    this.layersTreeView.connect('query-tooltip', Lang.bind(this, function(wid, x, y, key_mode, tooltip) {
        let [success, path, column, cellX, cellY] = _this.layersTreeView.get_path_at_pos(x, y);
        if (!success)
            return false;

        let [, iter] = _this.layersStore.get_iter(path);
        let layerId = _this.layersStore.get_value(iter, 2);

        tooltip.set_markup('<i>cogl_sampler' + layerId + '</i>');
        _this.layersTreeView.set_tooltip_cell(tooltip, path, column, null);
        return true;
    }));

    this.layerChooser.connect('response', Lang.bind(this, function(dialog, response) {
        if (response != Gtk.ResponseType.OK) {
            _this.layerChooser.hide();
            return;
        }

        let file = _this.layerChooser.get_file();
        if (file) {
            let iter = _this.layersStore.append();
            let path = _this.layersStore.get_path(iter);
            let layerId = path.get_indices()[0];
            _this.layersStore.set(iter,
                                  [0, 1, 2],
                                  [_this.layerChooser.preview_widget.pixbuf,
                                   file.get_uri(),
                                   layerId]);
            _this.pipelineContent.setLayerTexture(layerId, file.get_path());
        }

        _this.layerChooser.hide();
    }));

    builder.get_object('add-layer-button').connect('clicked', Lang.bind(this, function() {
        _this.layerChooser.show();
    }));


    this.getPixbuf = function(name) {
        let [success, iter] = _this.layersStore.get_iter_first();
        if (!success)
            return null;

        do {
            let layerId = _this.layersStore.get_value(iter, 2);
            if (('cogl_sampler' + layerId) == name) {
                let pixbuf = _this.layersStore.get_value(iter, 0);
                return pixbuf;
            }
        } while (_this.layersStore.iter_next(iter));

        return null;
    };
};
