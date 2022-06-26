"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutputMapper = exports.InputMapper = void 0;
class Mapper {
    constructor() {
        this.components = {};
        this.props = {};
        this.setup = {};
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
        this.propNames = [];
        this.dataProps = [];
        this.computedNames = [];
        this.methodNames = [];
        this.isComputedResolved = true;
    }
}
exports.InputMapper = InputMapper;
class OutputMapper extends Mapper {
    constructor() {
        super(...arguments);
        this.exportedObject = {};
        this.newCompositionImports = ['defineComponent'];
    }
}
exports.OutputMapper = OutputMapper;
//# sourceMappingURL=mapperModel.js.map