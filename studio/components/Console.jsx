import { useEffect, useRef, useState } from 'react';

// Raw serial console: everything the board prints, and a box to type commands.
export default function Console({ lines, send, connected }) {
  const [command, setCommand] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines]);

  function submit(e) {
    e.preventDefault();
    if (!command.trim()) return;
    send(command.trim());
    setCommand('');
  }

  return (
    <div className="panel">
      <h2>Serial console</h2>
      <pre className="console" ref={box}>{lines.join('\n')}</pre>
      <form className="row" onSubmit={submit}>
        <input
          style={{ flex: 1, minWidth: 200 }}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="help · ping · cfg · press 1 · kw paani 0.9 · set {&quot;mode&quot;:&quot;scan&quot;}"
          disabled={!connected}
        />
        <button className="primary" disabled={!connected}>Send</button>
      </form>
    </div>
  );
}
