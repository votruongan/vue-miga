"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputMapper = exports.InputMapper = void 0;
class Mapper {
    constructor() {
        this.components = {};
        this.props = {};
    }
}
class InputMapper extends Mapper {
    constructor() {
        super(...arguments);
        this.mixins = {};
        this.computed = {};
        this.data = {};
        this.watch = {};
        this.created = {};
        this.mounted = {};
        this.beforeUpdate = {};
        this.updated = {};
        this.beforeDestroy = {};
        this.destroyed = {};
        this.methods = {};
        this.importedIdentifierNames = [];
        this.localFileVariableNames = [];
        this.localFileFunctionNames = [];
        this.propNames = [];
        this.dataProps = [];
        this.computedNames = [];
        this.methodNames = [];
        this.emitsNames = new Set();
        this.refsNames = new Set();
        this.isComputedResolved = true;
    }
}
exports.InputMapper = InputMapper;
class OutputMapper extends Mapper {
    constructor() {
        super(...arguments);
        this.newCompositionImports = ['defineComponent'];
        this.otherImports = {};
        this.unsureExpression = [];
    }
}
exports.OutputMapper = OutputMapper;
//# sourceMappingURL=mapperModel.js.map