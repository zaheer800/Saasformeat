export default function Toggle({ isOn, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        isOn ? 'bg-green-500' : 'bg-gray-300'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      <span
        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
          isOn ? 'translate-x-7' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
