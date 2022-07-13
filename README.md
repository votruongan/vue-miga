# Vue-miga

Tool to migrate Vue 2 component from class component or option component to composition API.

After migrate to composition API, you could move to Vue 3 quite easily.

(ClassAPI | OptionAPI) => CompositionAPI

## Features

This tool aims to relieve below steps when migrate Vue 2 to Vue 3:
- Wrap an export default object, or export default class that extends Vue to `defineComponent` that have setup function.
- Declare component's prop in the body of setup function.
- Map component's data to the body of setup function, and wrap those data with `ref<Type>()`.
- Map component's method to the body of setup function.
- Map component's computed data to the body of setup function as declarations of `computed()`.
- Map component's watcher to the body of setup function. Squash many watcher to an array in `watch(name, callback)`.
- Map life cycle hooks to the body of setup function according to to new syntax.
- Rewrite all expression `this.xxx` to `xxx.value`
- Expose component's methods and data in the object returned in setup body of `defineComponent`.

## Example:

This tool can work with both OptionsAPI and Class API of Vue.

E.g.: For the class component syntax, we have a component as below:
``` typescript
@Component({
    name: 'MyComponent',
    props: {
        label: { type: String, required: true },
        onConfirm: { type: Function, required: true },
        isEnabled: { type: Boolean, required: true }
    },
})
export default class MyComponent extends Vue{
    label!: string;
    onConfirm!: any;
    isEnabled!: boolean;

    get btnClass () {
        const s = this.isEnabled ? 'complete' : 'incomplete';
        return { [s]: true };
    }
};
```

is transformed into:

``` typescript
import { defineComponent, toRefs, computed } from "@vue/composition-api";
export default defineComponent({
    components: {},
    props: {
        label: { type: String, required: true },
        onConfirm: { type: Function, required: true },
        isEnabled: { type: Boolean, required: true }
    },
    setup(props, context) {
        const { label, onConfirm, isEnabled } = toRefs(props);
        const btnClass = computed(() => {
            const s = isEnabled.value ? 'complete' : 'incomplete';
            return { [s]: true };
        });
        return {
            btnClass
        };
    },
});

```

## Installation

Download the whole folder and run the below block. Remember to let `<THE_PATH_OF_MIGA>` point to the folder that this project is at
``` bash
export VUE_MIGA_HOME=<THE_PATH_OF_MIGA>
export PATH=$VUE_MIGA_HOME/bin:$PATH

cd $VUE_MIGA_HOME
chmod +x bin/miga
```

## Usages
Change dir your shell to the root folder of the project that you want to convert. Foreach file you want to migrate, run:
``` bash
miga <file_path>
```
