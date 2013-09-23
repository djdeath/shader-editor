const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Signals = imports.signals;

const DiffListener = function() {

    let _this = this;

    this.OperationType = {
        INSERT: 0,
        DELETE: 1,
        REPLACE: 2,
        NONE: 3,
    };

    this._currentOperation = this.OperationType.NONE;
    this._currentOffset = -1;
    this._operations = [];
    this._currentOperation = null;
    this._currentStep = -1;

    /**/

    const Operation = function() {
    };
    Operation.prototype = {
        _init: function(type) {
            this.type = type;
        },

        canMerge: function(op) {
            return (this.type == op.type && this._canMerge(op));
        },
    };

    this._typeToClass = {};

    let newOperation = function(type, methods) {
        let klass = function() {
            this.time = GLib.DateTime.new_now_local().to_unix();
            this.type = type;
            this.init.apply(this, arguments);
        };
        klass.prototype = new Operation();
        for (let i in methods)
            klass.prototype[i] = methods[i];

        // Keep mapping type -> klass
        _this._typeToClass[type] = klass;

        return klass;
    };

    /**/

    this.Insertion = newOperation(_this.OperationType.INSERT, {
        init: function(offset, text) {
            this.offset = offset;
            this.text = text;
        },

        _canMerge: function(op) {
            if ((op.time - this.time) > 10)
                return false
            return (this.offset + this.text.length) == op.offset;
        },

        merge: function(op) {
            return new _this.Insertion(this.offset, this.text + op.text);
        },

        apply: function(text) {
            return text.slice(0, this.offset) + this.text + text.slice(this.offset);
        },
    });

    this.Deletion = newOperation(_this.OperationType.DELETE, {
        init: function(offset, text) {
            this.offset = offset;
            this.text = text;
        },

        _canMerge: function(op) {
            return this.offset == op.offset;
        },

        merge: function(op) {
            return new _this.Deletion(this.offset, this.text + op.text);
        },

        apply: function(text) {
            return text.slice(0, this.offset) + text.slice(this.offset + this.text.length);
        },
    });

    this.Replace = newOperation(_this.OperationType.REPLACE, {
        init: function(offset, oldText, newText) {
            this.offset = offset;
            this.oldText = oldText;
            this.newText = newText;
        },

        _canMerge: function(op) {
            return this.offset == op.offset;
        },

        merge: function(op) {
            return new _this.Replace(this.offset, this.oldText, op.newText);
        },

        apply: function(text) {
            return text.slice(0, this.offset) + this.newText + text.slice(this.offset + this.oldText.length)
        },
    });

    /**/

    this._mergeInsertions = function(insert1, insert2) {

    };

    this.storeOperation = function(op) {
        if (_this._currentOperation && _this._currentOperation.canMerge(op))
            _this._currentOperation = _this._currentOperation.merge(op);
        else {
            _this.flush();
            _this._currentOperation = op;
        }
    };

    this.insertText = function(offset, text) {
        _this.storeOperation(new _this.Insertion(offset, text));
    };

    this.deleteText = function(offset, text) {
        _this.storeOperation(new _this.Deletion(offset, text));
    };

    this.replaceText = function(offset, oldText, newText) {
        _this.storeOperation(new _this.Replace(offset, oldText, newText));
    };

    this.flush = function() {
        if (_this._currentOperation) {
            _this._operations.push(this._currentOperation);
            _this._currentOperation = null;
        }
    };

    this.serialize = function() {
        _this.flush();
        return JSON.stringify(_this._operations);
    };

    this.unserialize = function(string) {
        let _addProtoFuncs = function(dest, src) {
            for (let i in src)
                dest[i] = src[i];
        };

        try {
            let ops = JSON.parse(string);
            _this._operations = ops;

            // Ugly, but only way to get functional objects out of the
            // JSON parsing.
            for (let i in _this._operations) {
                let op = _this._operations[i];
                _addProtoFuncs(op,
                               _this._typeToClass[op.type].prototype);

            }
        } catch (ex) {
            log(ex);
            log("Couldn't parse JSON string : " + string);
        }
    };

    this.reconstruct = function(state) {
        let last = state == null ? _this._operations.length : (state >= 0 ? state : 0);
        let ret = '';

        for (let i = 0; i < last; i++) {
            let op = _this._operations[i];
            ret = op.apply(ret);

            //log(i + ' : ' + op.type + ' -> |' + ret + '|' + op.text + '|');
        }

        return ret;
    };

    this.getLength = function() {
        return _this._operations.length;
    };
};

/**/

if (1) {
    try {
        let diffs = new DiffListener();
        diffs.insertText(0, "plop");
        diffs.deleteText(2, "op");
        diffs.insertText(2, "gruik");
        diffs.insertText(1, "gruik");
        diffs.replaceText(1, "gruik", "graaa");
        log(diffs.serialize());
        log(diffs.reconstruct());

        let diffs2 = new DiffListener();
        diffs2.unserialize(diffs.serialize());
        log(diffs2.reconstruct());
    } catch (ex) {
        log(ex);
    }
}
