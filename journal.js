const Gio = imports.gi.Gio;
const DiffListener = imports.diffListener;

const Journal = function() {
    let _this = this;

    this._diffs = new DiffListener.DiffListener();
    this._suspended = false;
    this._currentState = -1;

    this.save = function() {
        let file = Gio.File.new_for_path('./journal.json');
        file.replace_contents(_this._diffs.serialize(), null, false,
                              Gio.FileCreateFlags.REPLACE_DESTINATION, null);
    };

    this.load = function() {
        try {
            let file = Gio.File.new_for_path('./journal.json');
            let [success, fileContent, tag] = file.load_contents(null);
            _this._diffs.unserialize(fileContent);
        } catch (ex) {
            log('No journal to start with');
        }
    };


    this._needReplay = function() {
        return ((_this._currentState != -1) &&
                (_this._currentState != _this._diffs.getLength()));
    };

    this.getPreviousState = function() {
        if (_this._currentState == -1)
            _this._currentState = _this._diffs.getLength() - 1;
        else
            _this._currentState = Math.max(0, _this._currentState - 1);
        return _this._diffs.reconstruct(_this._currentState);
    };

    this.getNextState = function() {
        if (_this._currentState == -1)
            return _this._diffs.reconstruct();
        else
            _this._currentState = Math.min(_this._currentState + 1, _this._diffs.getLength());
        return _this._diffs.reconstruct(_this._currentState);
    };

    this.getLastState = function() {
        return _this._diffs.reconstruct();
    };

    this.insertText = function(offset, text) {
        if (_this._suspended)
            return;

        if (_this._needReplay()) {
            /* TODO */
        }
        _this._diffs.insertText(offset, text);
    };

    this.deleteText = function(offset, text) {
        if (_this._suspended)
            return;

        if (_this._needReplay()) {
            /* TODO */
        }
        _this._diffs.deleteText(offset, text);
    };

    this.replaceText = function(offset, oldText, newText) {
        if (_this._suspended)
            return;

        if (_this._needReplay()) {
            /* TODO */
        }
        _this._diffs.replaceText(offset, oldText, newText);
    },

    this.suspendRecord = function() {
        _this._suspended = true;
    };

    this.unsuspendRecord = function() {
        _this._suspended = false;
    };

    this.canPrevious = function() {
        return (_this._currentState != 0) && (_this._diffs.getLength() > 0);
    };

    this.canNext = function() {
        return (_this._currentState != -1) && (_this._currentState < _this._diffs.getLength());
    };

    this.flush = function() {
        _this._diffs.flush();
    };
};
