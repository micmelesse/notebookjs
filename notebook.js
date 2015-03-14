// notebook.js 0.0.1
// http://github.com/jsvine/notebookjs
// (c) 2014 Jeremy Singer-Vine
// notebook.js may be freely distributed under the MIT license.
(function () {
    var root = this;
    var VERSION = "0.0.1";

    // Get browser or JSDOM document
    var doc = root.document || require("jsdom").jsdom();

    // Helper functions
    var ident = function (x) { return x; };

    var makeElement = function (tag, classNames) {
        var el = doc.createElement(tag);
        el.className = (classNames || []).map(function (cn) {
            return nb.prefix + cn;
        }).join(" ");
        return el;
    }; 

    var escapeHTML = function (raw) {
        var replaced = raw
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return replaced;
    };

    // Get supporting libraries
    var condRequire = function (module_name) {
        return typeof require === "function" && require(module_name);
    };

    var getMarkdown = function () {
        return root.marked || condRequire("marked"); 
    };

    var getAnsi = function () {
        var req = condRequire("ansi_up");
        var lib = root.ansi_up || req; 
        return lib && lib.ansi_to_html;
    };

    // Set up `nb` namespace
    var nb = {
        prefix: "nb-",
        markdown: getMarkdown() || ident,
        ansi: getAnsi() || ident,
        VERSION: VERSION
    };

    // Inputs
    nb.Input = function (raw, cell) {
        this.raw = raw; 
        this.cell = cell;
    };

    nb.Input.prototype.render = function () {
        if (!this.raw.length) { return makeElement("div"); }
        var holder = makeElement("div", [ "input" ]);
        var prompt_number = this.cell.raw.prompt_number;
        if (prompt_number) {
            holder.setAttribute("data-prompt-number", prompt_number);
        }
        var pre_el = makeElement("pre");
        var code_el = makeElement("code");
        var notebook = this.cell.worksheet.notebook;
        var lang = notebook.metadata.language || this.cell.raw.language;
        code_el.setAttribute("data-language", lang);
        code_el.className = "lang-" + lang;
        code_el.innerHTML = escapeHTML(this.raw.join(""));
        pre_el.appendChild(code_el);
        holder.appendChild(pre_el);
        this.el = holder;
        return holder;
    }; 

    // Outputs and output-renderers
    var imageCreator = function (format) {
        return function (data) {
            var el = makeElement("img", [ "image-output" ]);
            el.src = "data:image/" + format + ";base64," + data.replace(/\n/g, "");
            return el;
        };
    };

    nb.display = {};
    nb.display.text = function (text) {
        var el = makeElement("pre", [ "text-output" ]);
        el.innerHTML = escapeHTML(text.join(""));
        return el;
    };
    nb.display.html = function (html) {
        var el = makeElement("div", [ "html-output" ]);
        el.innerHTML = html.join("");
        return el;
    };
    nb.display.svg = function (svg) {
        var el = makeElement("div", [ "svg-output" ]);
        el.innerHTML = svg.join("");
        return el;
    };
    nb.display.latex = function (latex) {
        var el = makeElement("div", [ "latex-output" ]);
        el.innerHTML = latex.join("");
        return el;
    };
    nb.display.javascript = function (js) {
        var el = makeElement("script");
        script.innerHTML = js;
        return el;
    };
    nb.display.png = imageCreator("png");
    nb.display.jpeg = imageCreator("jpeg");

    nb.display_priority = [
        "png", "jpeg", "svg", "html",
        "latex", "javascript", "text"
    ];

    var render_display_data = function () {
        var o = this;
        var formats = nb.display_priority.filter(function (d) {
            return o.raw[d];
        });
        var format = formats[0];
        if (format) {
            return nb.display[format](o.raw[format]);
        } else {
            return makeElement("div", [ "empty-output" ]);
        }
    };

    nb.Output = function (raw, cell) {
        this.raw = raw; 
        this.cell = cell;
        this.type = raw.output_type;
    };

    nb.Output.prototype.renderers = {
        "display_data": render_display_data,
        "pyout": render_display_data,
        "pyerr": function () {
            var el = makeElement("pre", [ "pyerr" ]);
            el.innerHTML = nb.ansi(this.raw.traceback.join(""));
            return el;
        },
        "stream": function () {
            var el = makeElement("pre", [ this.raw.stream ]);
            var raw = this.raw.text.join("");
            el.innerHTML = nb.ansi(raw);
            return el;
        }
    };

    nb.Output.prototype.render = function () {
        var outer = makeElement("div", [ "output" ]);
        var prompt_number = this.cell.raw.prompt_number;
        if (prompt_number) {
            outer.setAttribute("data-prompt-number", prompt_number);
        }
        var inner = this.renderers[this.type].call(this); 
        outer.appendChild(inner);
        this.el = outer;
        return outer;
    };

    // Post-processing
    nb.coalesceStreams = function (outputs) {
        if (!outputs.length) { return outputs; }
        var last = outputs[0];
        var new_outputs = [ last ];
        outputs.slice(1).forEach(function (o) {
            if (o.raw.output_type === "stream" &&
                last.raw.output_type === "stream" &&
                o.raw.stream === last.raw.stream) {
                last.raw.text = last.raw.text.concat(o.raw.text);
            } else {
                new_outputs.push(o);
                last = o;
            }
        });
        return new_outputs;
    };

    // Cells
    nb.Cell = function (raw, worksheet) {
        var cell = this;
        cell.raw = raw;
        cell.worksheet = worksheet;
        cell.type = raw.cell_type;
        if (cell.type === "code") {
            cell.input = new nb.Input(cell.raw.input, cell);
            var raw_outputs = (cell.raw.outputs || []).map(function (o) {
                return new nb.Output(o, cell); 
            });
            cell.outputs = nb.coalesceStreams(raw_outputs);
        }
    };

    nb.Cell.prototype.renderers = {
        markdown: function () {
            var el = makeElement("div", [ "cell", "markdown-cell" ]);
            el.innerHTML = nb.markdown(this.raw.source.join(""));
            return el;
        },
        heading: function () {
            var el = makeElement("h" + this.raw.level, [ "cell", "heading-cell" ]);
            el.innerHTML = this.raw.source.join("");
            return el;
        },
        code: function () {
            var cell_el = makeElement("div", [ "cell", "code-cell" ]);
            cell_el.appendChild(this.input.render());
            var output_els = this.outputs.forEach(function (o) {
                cell_el.appendChild(o.render());
            });
            return cell_el;
        }
    };

    nb.Cell.prototype.render = function () {
        var el = this.renderers[this.type].call(this); 
        this.el = el;
        return el;
    };

    // Worksheets
    nb.Worksheet = function (raw, notebook) {
        var worksheet = this;
        this.raw = raw;
        this.notebook = notebook;
        this.cells = raw.cells.map(function (c) {
            return new nb.Cell(c, worksheet);
        });
        this.render = function () {
            var worksheet_el = makeElement("div", [ "worksheet" ]);
            worksheet.cells.forEach(function (c) {
                worksheet_el.appendChild(c.render()); 
            });
            this.el = worksheet_el;
            return worksheet_el;
        };
    };

    // Notebooks
    nb.Notebook = function (raw, config) {
        var notebook = this;
        this.raw = raw;
        this.config = config;
        var meta = this.metadata = raw.metadata;
        this.title = meta.title || meta.name;
        this.worksheets = raw.worksheets.map(function (ws) {
            return new nb.Worksheet(ws, notebook);
        });
        this.sheet = this.worksheets[0];
    };

    nb.Notebook.prototype.render = function () {
        var notebook_el = makeElement("div", [ "notebook" ]);
        this.worksheets.forEach(function (w) {
            notebook_el.appendChild(w.render()); 
        });
        this.el = notebook_el;
        return notebook_el;
    };
    
    nb.parse = function (nbjson, config) {
        return new nb.Notebook(nbjson, config);
    };

    // Exports
    if (typeof define === 'function' && define.amd) {
        define(function() {
            return nb;
        });
    }
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = nb;
        }
        exports.nb = nb;
    } else {
        root.nb = nb;
    }
    
}).call(this);
