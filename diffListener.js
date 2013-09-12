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
            this.init.apply(this, arguments// Array.prototype.slice.call(arguments, 1, arguments.length)
                           );
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
            return (this.offset + this.text.length) == op.offset;
        },

        merge: function(op) {
            return new _this.Insertion(this.offset, this.text + op.text);
        },
    });

    this.Deletion = newOperation({
        init: function(offset, length) {
            this.type = _this.OperationType.DELETE;
            this.offset = offset;
            this.length = length;
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

    this.unseralize = function(string) {
        try {
            let ops = JSON.parser(string);
            _this._operations = ops;
        } catch (ex) {
            log('Couldn\'t parse JSON string : ' + string);
        }
    };
};

/**/
/*
let diffs = new DiffListener();
diffs.insertText(0, "plop");
diffs.deleteText(2, "op");
log(diffs.serialize());
*/
