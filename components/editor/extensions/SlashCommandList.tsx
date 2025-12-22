import React from 'react';

interface CommandItem {
  command: {
    id: string;
    label: string;
    description: string;
  };
}

interface SlashCommandListProps {
  items: CommandItem[];
  command: (item: CommandItem) => void;
}

export const SlashCommandList = React.forwardRef<any, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = React.useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    React.useEffect(() => setSelectedIndex(0), [items]);

    React.useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === 'ArrowUp') {
          upHandler();
          return true;
        }

        if (event.key === 'ArrowDown') {
          downHandler();
          return true;
        }

        if (event.key === 'Enter') {
          enterHandler();
          return true;
        }

        return false;
      },
    }));

    return (
      <div className="bg-white border rounded-lg shadow-lg p-1 min-w-[280px] max-h-[300px] overflow-y-auto">
        {items.length ? (
          items.map((item, index) => (
            <button
              key={index}
              className={`w-full text-left px-3 py-2 rounded text-sm ${
                index === selectedIndex
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => selectItem(index)}
            >
              <div className="font-medium">{item.command.label}</div>
              <div className="text-xs text-gray-500">{item.command.description}</div>
            </button>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-gray-500">No commands found</div>
        )}
      </div>
    );
  }
);

SlashCommandList.displayName = 'SlashCommandList';









