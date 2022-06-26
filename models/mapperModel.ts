type Object = Record<string, any> 


class Mapper {
    components: Object = {}
    props: Object = {}
    setup: Object = {}
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
    propNames: Array<string> = []
    dataProps: Array<Object> = []
    computedNames: Array<string> = []
    methodNames: Array<string> = []
    isComputedResolved: boolean = true
}

export class OutputMapper extends Mapper {
    exportedObject: Object = {}
    newCompositionImports: Array<string> = ['defineComponent']
}