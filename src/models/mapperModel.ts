import { MethodDeclaration, Node, ObjectLiteralExpression, SourceFile, ts } from "ts-morph"
import { ImportPayload } from "./payload"

type Object = Record<string, any> 


class Mapper {
    components: Object = {}
    props: Object = {}
    setup!: MethodDeclaration
}

export class InputMapper extends Mapper {
    mixins: Object = {}
    computed: Object = {}
    data: Object = {}
    watch: Object = {}
    created: Object = {}
    mounted: Object = {}
    beforeUpdate: Object = {}
    updated: Object = {}
    beforeDestroy: Object = {}
    destroyed: Object = {}
    methods: Object = {}
    importedIdentifierNames: Array<string> = []
    localFileVariableNames: Array<string> = []
    localFileFunctionNames: Array<string> = []
    propNames: Array<string> = []
    dataProps: Array<Object> = []
    computedNames: Array<string> = []
    methodNames: Array<string> = []
    emitsNames: Set<string> = new Set<string>()
    refsNames: Set<string> = new Set<string>()
    isComputedResolved: boolean = true
    inputFile!: SourceFile
}

export class OutputMapper extends Mapper {
    exportedObject?: ObjectLiteralExpression
    newCompositionImports: Array<string> = ['defineComponent']
    otherImports: Record<string, ImportPayload> = {}
    unsureExpression: Array<Node> = []
}