const Nodes = function() {

    this.literals = [];
    this.variables = [];
    this.functions = [];

    this._context = [[]];


    let parent = this;

    /**
     * Creates a location object. Mostly used inside the grammar's
     * code.
     */

    this.loc = function() {
        let start, end;
        if (arguments.length > 1) {
            start = arguments[0];
            end = arguments[1];
        } else {
            start = arguments[0];
            end = arguments[0];
        }
        return {
            first_line: start.first_line - 1,
            last_line: end.last_line - 1,
            first_column: start.first_column,
            last_column: end.last_column,
        };
    };

    this.locToString = function(location) {
        return '(' + location.first_line + ',' + location.first_column +
            ' -> ' + location.last_line + ',' + location.last_column + ')';
    };

    this.copyLocation = function(location) {
        return {
            first_line: location.first_line,
            last_line: location.last_line,
            first_column: location.first_column,
            last_column: location.last_line,
        };
    };

    /**
     * Deals with context (functions and variables accessibles at a
     * given location).
     */

    this.pushContext = function() {
        parent._context.push([]);
    };

    this.popContext = function() {
        parent._context.pop();
    };

    this.findElementInContext = function(location, name) {
        for (let i = parent._context.length - 1; i >= 0 ; i--) {
            let contextLayer = parent._context[i];
            for (let j in contextLayer) {
                let element = contextLayer[j];

                if (element.name == name)
                    return element;
            }
        }

        let error = new Error('Can\'t find symbol : ' + name);
        error.name = 'SymbolError';
        error.line = location.first_line;
        throw error;
    };

    this.addToContext = function(element) {
        parent._context[parent._context.length - 1].push(element);
    };

    /**
     * Abstract element of the AST.
     */

    const Element = function() {
    };
    Element.prototype = {
        _init: function(begin, end) {
            // log('begin:' + parent.locToString(begin));
            // log('end:' + parent.locToString(end));

            this.location = parent.loc(begin, end);

            this.children = [];
            this.arguments = [];
            this.parameters = [];
            this.references = [];
        },

        addChild: function(child) {
            child.parent = this;
            this.children.push(child);
        },

        addArgument: function(arg) {
            this.arguments.push(arg);
        },

        addParameter: function(param) {
            this.parameters.push(param);
        },

        addReference: function(location) {
            this.references.push({
                first_line: location.first_line,
                last_line: location.last_line,
                first_column: location.first_column,
                last_column: location.last_column,
            });
        },

        updateStartLocation: function(location) {
            this.location.first_line = location.first_line;
            this.location.first_column = location.first_column;
        },

        updateEndLocation: function(location) {
            this.location.last_line = location.last_line;
            this.location.last_column = location.last_column;
        },

        updateLocation: function(_location) {
            let location = parent.loc(_location);
            this.updateStartLocation(location);
            this.updateEndLocation(location);
        },

        containsPosition: function(line, offset) {
            // log(parent.locToString(this.location) +
            //     ' looking for ' + line + ',' + offset);
            if (this.location.first_line <= line &&
                this.location.last_line >= line &&
                this.location.first_column <= offset &&
                this.location.last_column >= offset)
                return true;
            for (let i in this.references) {
                let ref = this.references[i];

                if (ref.first_line <= line &&
                    ref.last_line >= line &&
                    ref.first_column <= offset &&
                    ref.last_column >= offset)
                    return true;
            }
            return false;
        },

        getName: function() {
            if (this.name != null)
                return this.name;
            return '[unknown]';
        },

        isInteger: function() {
            return this.init == parent.Integer.prototype.init;
        },

        isFloat: function() {
            return this.init == parent.Float.prototype.init;
        },

        isBoolean: function() {
            return this.init == parent.Boolean.prototype.init;
        },

        isLiteral: function() {
            return this.isInteger() || this.isFloat() || this.isBoolean();
        },
    };

    let newElement = function(methods) {
        let klass = function() {
            this._init(arguments[0], arguments[1]);
            this.init.apply(this, Array.prototype.slice.call(arguments, 2, arguments.length));
            // arguments.slice(1, arguments.length));
        };
        klass.prototype = new Element();
        for (let i in methods)
            klass.prototype[i] = methods[i];

        return klass;
    };

    /**
     * Basic elements of the AST.
     */

    this.Float = newElement({
        init: function(value) {
            this.value = parseFloat(value);
            parent.literals.push(this);
        },
    });

    this.Integer = newElement({
        init: function(value) {
            this.value = parseInt(value);
            parent.literals.push(this);
        },
    });

    this.Boolean = newElement({
        init: function(value) {
            this.value = parseBoolean(value);
            parent.literals.push(this);
        },
    });

    this.Variable = newElement({
        init: function(name, _nameLocation) {
            this.name = name;
            this.nameLocation = parent.loc(_nameLocation);
            parent.variables.push(this);
            parent.addToContext(this);
        },
    });

    this.VariableRef = newElement({
        init: function(name) {
            this.name = name;
        },
    });

    this.VariableElementRef = newElement({
        init: function(name, field) {
            this.name = name;
            this.field = field;
        },
    });

    this.Function = newElement({
        init: function(name, _nameLocation) {
            this.name = name;
            this.nameLocation = parent.loc(_nameLocation);
            parent.functions.push(this);
            parent.addToContext(this);
        },
    });

    this.Expression = newElement({
        init: function() {
            for (let i = 0; i < arguments.length; i++)
                this.addChild(arguments[i]);
        },
    });

    this.FunctionCall = newElement({
        init: function(name) {
            this.name = name;
        },
    });

    /**
     * Helpers for the grammar.
     */

    this.addVariableReference = function(_location, name) {
        let location = parent.loc(_location);
        //log('adding var ref ' + name + ' @ ' + parent.locToString(location));
        let v = parent.findElementInContext(location, name);
        v.addReference(location);

        return new parent.VariableRef(location, name);
    };

    this.addFunctionCall = function(_location, name) {
        let location = parent.loc(_location);
        //log('adding function ref ' + name + ' @ ' + parent.locToString(location));
        let v = parent.findElementInContext(location, name);
        v.addReference(location);

        return new parent.FunctionCall(location, name);
    };

    /**/

    this.parseError = function(error, context) {
        let e = new Error(error);
        e.name = 'ParsingError';
        e.line = context.line
        log('fuuuuuuuuuuuuuuuuuck : ' + context.line + ':' + context.column);
        throw e;
    };

    /* Builtin variables */

    let builtinVariable = function(name) {
        return new parent.Variable({ first_line: 1,
                                     first_column: 0, },
                                   { last_line: 1,
                                     last_column: 0, },
                                   name,
                                   { first_line: 1,
                                     first_column: 0,
                                     last_line: 1,
                                     last_column: 0, });
    };

    let builtinFunction = function(name) {
        return new parent.Function({ first_line: 1,
                                     first_column: 0, },
                                   { last_line: 1,
                                     last_column: 0, },
                                   name,
                                   { first_line: 1,
                                     first_column: 0,
                                     last_line: 1,
                                     last_column: 0, });
    };

    let vertexVariables = [
        'cogl_position_in',
        'cogl_color_in',
        'cogl_tex_coord_in',
        'cogl_tex_coord0_in',
        'cogl_normal_in',
        'cogl_position_out',
        'cogl_point_size_out',
        'cogl_color_out',
        'cogl_tex_coord_out',
    ];

    let fragmentVariables = [
        'cogl_color_in',
        'cogl_tex_coord_in',
        'cogl_color_out',
        'cogl_depth_out',
        'cogl_front_facing',
        'cogl_sampler0',
        'cogl_sampler1',
        'cogl_sampler2',
        'cogl_sampler3',
        'cogl_sampler4',
        'cogl_sampler5',
        'cogl_sampler6',
        'cogl_sampler7',
    ];

    let glslFunction = [
        'texture2D',
    ];

    for (let i in fragmentVariables)
        builtinVariable(fragmentVariables[i]);

    for (let i in glslFunction)
        builtinFunction(glslFunction[i]);
};

/**/
// let nodes = new Nodes();
// let f = new nodes.Float({}, {}, '1.42');
// log(nodes.literals[0].value);
// let i = new nodes.Integer({}, {}, '42');
// log(nodes.literals[1].value);
// log(f.init == nodes.Float.prototype.init);
