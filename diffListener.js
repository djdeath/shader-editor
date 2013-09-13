const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Lang = imports.lang;
const Signals = imports.signals;

const DiffListener = function() {

    let _this = this;

    this.OperationType = {
        INSERT: 0,
        DELETE: 1,
        NONE: 2,
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

    let newOperation = function(methods) {
        let klass = function() {
            //this._init(type);
            this.time = GLib.DateTime.new_now_local().to_unix();
            this.init.apply(this, arguments);
        };
        klass.prototype = new Operation();
        for (let i in methods)
            klass.prototype[i] = methods[i];

        return klass;
    };

    /**/

    this.Insertion = newOperation({
        init: function(offset, text) {
            this.type = _this.OperationType.INSERT;
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
    });

    this.Deletion = newOperation({
        init: function(offset, text) {
            this.type = _this.OperationType.DELETE;
            this.offset = offset;
            this.text = text;
        },

        _canMerge: function(op) {
            return this.offset == op.offset;
        },

        merge: function(op) {
            return new _this.Deletion(this.offset, this.text + op.text);
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
        try {
            let ops = JSON.parse(string);
            _this._operations = ops;
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
            switch (op.type) {
            case _this.OperationType.INSERT:
                ret = ret.slice(0, op.offset) + op.text + ret.slice(op.offset);
                break;

            case _this.OperationType.DELETE:
                ret = ret.slice(0, op.offset) + ret.slice(op.offset + op.text.length);
                break;

            default:
                throw new Error('unknown operation');
            }

            log(i + ' : ' + op.type + ' -> |' + ret + '|' + op.text + '|');
        }

        return ret;
    };

    this.getLength = function() {
        return _this._operations.length;
    };
};

/**/

// let diffs = new DiffListener();
// diffs.insertText(0, "plop");
// diffs.deleteText(2, "op");
// diffs.insertText(2, "gruik");
// diffs.insertText(1, "gruik");
// log(diffs.serialize());
// log(diffs.reconstruct());
